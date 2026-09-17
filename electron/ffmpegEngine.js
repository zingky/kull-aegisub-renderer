'use strict'

/**
 * ══════════════════════════════════════════════════════════════════
 *  ffmpegEngine.js — CORE ENGINE của Kull Aegisub Renderer
 *
 *  GIAI ĐOẠN 2: Đọc thông số gốc (ffprobe), thuật toán Bitrate VBR,
 *              xử lý Subtitle Plugin (VSFilter/dll + libass), escape path.
 *  GIAI ĐOẠN 3: Tự động Scale/Pad Intro & Outro theo chuẩn của Video chính,
 *              ghép bằng filter concat.
 *  GIAI ĐOẠN 4: spawn FFmpeg, parse tiến trình từ stderr, hủy/render.
 * ══════════════════════════════════════════════════════════════════
 */
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { ffmpegPath, ffprobePath, resolveBin } = require('./paths')
const { makeT } = require('./i18n')

// ─────────────────────────────────────────────────────────────
// 1. PROBE — Đọc thông số file media bằng ffprobe
//    Trả về: width, height, fps, duration, bitrate_avg (kbps),
//            codec gốc, thông tin audio, kích thước file.
// ─────────────────────────────────────────────────────────────
function probeMedia(filePath, lang) {
  const t = makeT(lang)
  return new Promise((resolve, reject) => {
    const child = spawn(ffprobePath, [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ])
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d.toString('utf8')))
    child.stderr.on('data', (d) => (err += d.toString('utf8')))
    child.on('error', (e) => reject(new Error(t('eng.errProbeRun', { msg: e.message }))))
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(t('eng.errProbeCode', { code, detail: err.trim() || filePath })))
      try {
        const info = JSON.parse(out)
        const video = (info.streams || []).find((s) => s.codec_type === 'video')
        const audio = (info.streams || []).find((s) => s.codec_type === 'audio')
        const fmt = info.format || {}
        const [num, den] = String(video?.avg_frame_rate || '0/1').split('/')
        const fps = parseFloat(num) / (parseFloat(den) || 1)
        const duration = parseFloat(fmt.duration || video?.duration || '0')
        const bitrateAvg = Math.round((parseInt(fmt.bit_rate || video?.bit_rate || '0', 10) || 0) / 1000)
        resolve({
          path: filePath,
          width: video?.width || 0,
          height: video?.height || 0,
          fps: isFinite(fps) ? Math.round(fps * 1000) / 1000 : 0,
          duration: isFinite(duration) ? duration : 0,
          bitrateAvg, // kbps
          videoCodec: video?.codec_name || '',
          audioCodec: audio?.codec_name || '',
          hasAudio: !!audio,
          sampleRate: audio?.sample_rate ? parseInt(audio.sample_rate, 10) : 48000,
          channels: audio?.channels || 2,
          sizeBytes: parseInt(fmt.size || '0', 10) || 0,
        })
      } catch (e) {
        reject(new Error(t('eng.errProbeParse', { msg: e.message })))
      }
    })
  })
}

// ─────────────────────────────────────────────────────────────
// 2. ESCAPE PATH — Đảm bảo đường dẫn Windows không phá cú pháp FFmpeg
//    - Thay \ thành /
//    - Escape dấu : thành \: (quan trọng với ổ đĩa C:\...)
//    - Escape dấu nháy đơn
// ─────────────────────────────────────────────────────────────
function escapeFilterPath(p) {
  return String(p).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

// ─────────────────────────────────────────────────────────────
// 3. PARSE PROGRESS — Đọc dòng stderr kiểu:
//    frame= 123 fps=45.6 q=28.0 size=... time=00:01:23.45 bitrate=... speed=1.5x
//    Trả về: progress %, fps thực tế, speed (x), ETA (giây)
// ─────────────────────────────────────────────────────────────
const RE_TIME = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/
const RE_FPS = /fps=\s*([\d.]+)/
const RE_SPEED = /speed=\s*([\d.]+(?:\.\d+)?)x/
const RE_FRAME = /frame=\s*(\d+)/
const RE_BITRATE = /bitrate=\s*([\d.]+)(k|M)bits\/s/
const RE_SIZE = /size=\s*(\d+)(k|M|G)?B/i

function parseProgressLine(line, total) {
  const m = line.match(RE_TIME)
  if (!m) return null
  const secs = +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])
  const progress = total > 0 ? Math.min(100, Math.round((secs / total) * 1000) / 10) : 0
  let fps = null
  let eta = null
  let speed = null
  let frame = null
  let bitrate = null // kb/s
  let sizeKB = null
  const fm = line.match(RE_FPS)
  if (fm) fps = parseFloat(fm[1])
  const sm = line.match(RE_SPEED)
  if (sm) speed = parseFloat(sm[1])
  const frm = line.match(RE_FRAME)
  if (frm) frame = parseInt(frm[1], 10)
  const bm = line.match(RE_BITRATE)
  if (bm) bitrate = parseFloat(bm[1]) * (bm[2] === 'M' ? 1000 : 1)
  const szm = line.match(RE_SIZE)
  if (szm) {
    const mult = szm[2] ? { k: 1, m: 1024, g: 1024 * 1024 }[szm[2].toLowerCase()] : 1
    sizeKB = Math.round(parseFloat(szm[1]) * mult)
  }
  const remaining = Math.max(0, total - secs)
  if (fps && fps > 0) eta = remaining / fps
  else if (speed && speed > 0) eta = remaining / speed
  const timeStr = `${m[1]}:${m[2]}:${m[3]}`
  return { progress, fps, speed, eta, frame, bitrate, sizeKB, time: timeStr }
}

// ─────────────────────────────────────────────────────────────
// 4. PHÁT HIỆN NĂNG LỰC MÁY (cache 1 lần)
//    - Encoder GPU khả dụng (nvenc/qsv/amf) qua `ffmpeg -encoders`
//    - FFmpeg build có hỗ trợ avisynth hay không
//    - AviSynth+ có được cài trong máy hay không
// ─────────────────────────────────────────────────────────────
let encoderCache = null
let avisynthFfmpegCache = null

function runCapture(binary, args) {
  return new Promise((resolve) => {
    let child
    let out = ''
    try {
      child = spawn(binary, args, { windowsHide: true })
    } catch {
      return resolve('')
    }
    child.stdout.on('data', (d) => (out += d.toString('utf8')))
    child.stderr.on('data', (d) => (out += d.toString('utf8')))
    child.on('error', () => resolve(''))
    child.on('close', () => resolve(out))
  })
}

async function detectEncoders() {
  if (encoderCache) return encoderCache
  const out = await runCapture(ffmpegPath, ['-hide_banner', '-encoders'])
  const has = (n) => out.includes(n)
  encoderCache = []
  if (has('h264_nvenc')) encoderCache.push('nvenc')
  if (has('h264_qsv')) encoderCache.push('qsv')
  if (has('h264_amf')) encoderCache.push('amf')
  encoderCache.push('cpu') // CPU (libx264/libx265) luôn khả dụng
  return encoderCache
}

async function hasAviSynthFfmpeg() {
  if (avisynthFfmpegCache !== null) return avisynthFfmpegCache
  const out = await runCapture(ffmpegPath, ['-hide_banner', '-demuxers'])
  avisynthFfmpegCache = /\bavisynth\b/.test(out)
  return avisynthFfmpegCache
}

/**
 * Kiểm tra AviSynth core có sẵn ở đâu:
 *   1. bundled: bin/AviSynth.dll (portable — đối tác với ffmpeg.exe)
 *   2. Hệ thống: AviSynth+ đã cài trong Program Files
 */
function isAviSynthInstalled() {
  if (resolveBin('AviSynth.dll')) return true
  const candidates = [
    'C:\\Program Files (x86)\\AviSynth+\\plugins64\\AviSynth.dll',
    'C:\\Program Files (x86)\\AviSynth+\\AviSynth.dll',
    'C:\\Program Files\\AviSynth+\\plugins64\\AviSynth.dll',
    'C:\\Program Files\\AviSynth+\\AviSynth.dll',
  ]
  return candidates.some((p) => fs.existsSync(p))
}

// ─────────────────────────────────────────────────────────────
// 5. ÁNH XẠ Phần cứng -> tên Encoder FFmpeg
//    Giữ nguyên family codec gốc (h264/hevc) khi bật "Giữ nguyên chất lượng"
// ─────────────────────────────────────────────────────────────
const ENCODER_MAP = {
  h264: { nvenc: 'h264_nvenc', qsv: 'h264_qsv', amf: 'h264_amf', cpu: 'libx264' },
  hevc: { nvenc: 'hevc_nvenc', qsv: 'hevc_qsv', amf: 'hevc_amf', cpu: 'libx265' },
}

function pickEncoder(hardware, codecFamily, available, t) {
  const tr = typeof t === 'function' ? t : makeT('vi')
  if (hardware === 'auto') {
    for (const h of ['nvenc', 'qsv', 'amf', 'cpu']) {
      if (available.includes(h)) {
        if (h === 'cpu') return { encoder: ENCODER_MAP[codecFamily].cpu, hardware: 'cpu', label: 'CPU (x264/x265)' }
        return { encoder: ENCODER_MAP[codecFamily][h], hardware: h, label: h.toUpperCase() }
      }
    }
    return { encoder: ENCODER_MAP[codecFamily].cpu, hardware: 'cpu', label: 'CPU (x264/x265)' }
  }
  const enc = ENCODER_MAP[codecFamily][hardware]
  if (enc && hardware !== 'cpu' && !available.includes(hardware)) {
    return { encoder: ENCODER_MAP[codecFamily].cpu, hardware: 'cpu', label: tr('eng.cpuFallback'), fallback: true }
  }
  return { encoder: enc || ENCODER_MAP[codecFamily].cpu, hardware, label: hardware.toUpperCase() }
}

// ─────────────────────────────────────────────────────────────
// 6. THUẬT TOÁN AUTO BITRATE — Constrained VBR (VBV buffer)
//    original : giữ 100% bitrate gốc, maxrate = avg*1.25, bufsize = avg*2
//    high     : ~75% bitrate  => nét ~90-95% gốc, dung lượng ~70-80%
//    balanced : ~55% bitrate  => tối ưu chia sẻ MXH
//    small    : ~32% bitrate  => nén tối đa cho máy bộ nhớ thấp
//    custom   : người dùng nhập Resolution/FPS/Bitrate trực tiếp
// ─────────────────────────────────────────────────────────────
function qualityArgs(quality, meta, custom) {
  const avg = Math.max(meta.bitrateAvg, 600)
  let bv, maxr, buf
  switch (quality) {
    case 'high':
      bv = avg * 0.75; maxr = avg; buf = avg * 1.5
      break
    case 'balanced':
      bv = avg * 0.55; maxr = avg * 0.7; buf = avg * 1.1
      break
    case 'small':
      bv = avg * 0.32; maxr = avg * 0.45; buf = avg * 0.7
      break
    case 'custom':
      bv = parseFloat(custom?.bitrate) || avg
      maxr = bv * 1.25; buf = bv * 2
      break
    case 'original':
    default:
      bv = avg; maxr = avg * 1.25; buf = avg * 2
      break
  }
  const k = (v) => Math.max(100, Math.round(v))
  return { bitrate: k(bv), maxrate: k(maxr), bufsize: k(buf) }
}

// ─────────────────────────────────────────────────────────────
// 7. SUBTITLE PLUGIN — VSFilterMod.dll / VSFilter.dll / libass
//    - VSFilter*.dll cần chạy qua AviSynth (sinh file .avs tạm):
//        LoadPlugin("bin/VSFilterMod.dll") + DirectShowSource + TextSub
//    - Nếu thiếu AviSynth+ hoặc FFmpeg thiếu avisynth demuxer
//      => cảnh báo và fallback sang libass (vẫn render được).
//    - libass: filter subtitles nội bộ, path đã escape theo chuẩn Windows.
// ─────────────────────────────────────────────────────────────
function createAvsScript(mainVideo, subtitlePath, dllPath, meta) {
  const toFwd = (p) => String(p).replace(/\\/g, '/')
  const lines = ['SetFilterMTMode("DEFAULT_MT_MODE", 2)']
  lines.push(`LoadPlugin("${toFwd(dllPath)}")`)
  // AviSynth+ 3.7.x tách DirectShowSource thành plugin riêng — load kèm nếu có
  const dss = resolveBin('avsplugins/DirectShowSource.dll')
  if (dss) lines.push(`LoadPlugin("${toFwd(dss)}")`)
  lines.push(`DirectShowSource("${toFwd(mainVideo)}", fps=${meta.fps || 23.976}, convertfps=true)`)
  lines.push(`TextSub("${toFwd(subtitlePath)}")`)
  const tmpPath = path.join(os.tmpdir(), `kull_vietsub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.avs`)
  fs.writeFileSync(tmpPath, lines.join('\r\n'), 'utf8')
  return tmpPath
}

/** Preflight: thử đọc script .avs + xuất 1 frame — xác nhận DLL thực sự có TextSub & decode được */
function preflightAvs(avsPath) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-i', avsPath, '-frames:v', '1', '-f', 'null', '-'], { windowsHide: true })
    } catch {
      return resolve(false)
    }
    const timer = setTimeout(() => {
      try { child.kill() } catch (e) {}
      resolve(false)
    }, 30000)
    child.on('error', () => { clearTimeout(timer); resolve(false) })
    child.on('close', (code) => { clearTimeout(timer); resolve(code === 0) })
  })
}

/**
 * Subtitle Plan — chọn đường dẫn render phụ đề.
 *  - libass : -vf "subtitles='path.ass'" (FFmpeg native)
 *  - VSFilter.dll / VSFilterMod.dll : sinh script AviSynth (.avs) rồi preflight.
 *    + Ưu tiên đúng DLL đã chọn; nếu DLL đó không đăng ký TextSub (bản DirectShow-only
 *      như VSFilterMod.dll hiện có trong bin), tự thử DLL còn lại.
 *    + Thiếu AviSynth core (bundled/system) hoặc FFmpeg thiếu avisynth
 *      => fallback libass + log rõ ràng.
 */
async function buildSubtitlePlan(engine, subtitlePath, mainVideo, meta, lang) {
  const t = makeT(lang)
  if (engine !== 'libass') {
    const avsCoreOk = isAviSynthInstalled() && (await hasAviSynthFfmpeg())
    if (avsCoreOk) {
      const preferred = engine === 'vsfilter' ? 'VSFilter.dll' : 'VSFilterMod.dll'
      const other = engine === 'vsfilter' ? 'VSFilterMod.dll' : 'VSFilter.dll'
      for (const dllName of [preferred, other]) {
        const dll = resolveBin(dllName)
        if (!dll) continue
        const avsPath = createAvsScript(mainVideo, subtitlePath, dll, meta)
        const ok = await preflightAvs(avsPath)
        if (ok) {
          return {
            type: 'avs',
            dll,
            dllName,
            avsPath,
            note: dllName === preferred ? null : t('eng.swapNote', { preferred, dll: dllName }),
            warning: null,
          }
        }
        try { fs.unlinkSync(avsPath) } catch (e) {}
      }
      return {
        type: 'libass',
        filter: `subtitles='${escapeFilterPath(subtitlePath)}'`,
        warning: t('eng.warnNoPlugin'),
      }
    }
    return {
      type: 'libass',
      filter: `subtitles='${escapeFilterPath(subtitlePath)}'`,
      warning: t('eng.warnNoAviSynth'),
    }
  }
  return {
    type: 'libass',
    filter: `subtitles='${escapeFilterPath(subtitlePath)}'`,
    warning: null,
  }
}

// ─────────────────────────────────────────────────────────────
// 8. TỰ ĐỘNG SCALE/PAD Intro & Outro theo chuẩn Video chính
//    scale=W:H:force_original_aspect_ratio=decrease,
//    pad=W:H:(ow-iw)/2:(oh-ih)/2:black,
//    fps=FPS (chuẩn video chính), setsar=1 => khớp trước khi concat
// ─────────────────────────────────────────────────────────────
function buildScalePadFilter(W, H, FPS) {
  return `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,fps=${FPS},setsar=1`
}

// ─────────────────────────────────────────────────────────────
// 9. LẮP RÁP CÂU LỆNH FFMPEG — GIAI ĐOẠN 2+3
//    - Probe toàn bộ file, tính chuẩn W/H/FPS từ Video chính (hoặc custom)
//    - Ghép Intro/Outro bằng filter_complex + concat (xử lý cả audio câm)
//    - Hardsub qua libass hoặc chèn sẵn qua AviSynth (.avs)
// ─────────────────────────────────────────────────────────────
function parseResolution(str) {
  const [w, h] = String(str || '1280x720').toLowerCase().split('x').map((v) => parseInt(v, 10))
  return [w > 0 ? w : 1280, h > 0 ? h : 720]
}

async function buildRenderCommand(options) {
  const t = makeT(options.lang)
  // 9a. Probe các file liên quan
  const mainMeta = await probeMedia(options.mainVideo, options.lang)
  const metaMap = { main: mainMeta }
  let durationTotal = mainMeta.duration
  const hasIntro = !!(options.mergeEnabled && options.intro)
  const hasOutro = !!(options.mergeEnabled && options.outro)
  if (hasIntro) {
    metaMap.intro = await probeMedia(options.intro, options.lang)
    durationTotal += metaMap.intro.duration
  }
  if (hasOutro) {
    metaMap.outro = await probeMedia(options.outro, options.lang)
    durationTotal += metaMap.outro.duration
  }

  // 9b. Subtitle plan (libass hoặc avs)
  const subPlan = await buildSubtitlePlan(options.subtitleEngine, options.subtitle, options.mainVideo, mainMeta, options.lang)

  // 9c. Chuẩn xuất W/H/FPS — lấy từ video chính hoặc người dùng custom
  let W = mainMeta.width
  let H = mainMeta.height
  let FPS = mainMeta.fps
  if (options.quality === 'custom') {
    const [cw, ch] = parseResolution(options.custom?.resolution)
    W = cw; H = ch
    if (parseFloat(options.custom?.fps) > 0) FPS = parseFloat(options.custom.fps)
  }
  if (!W || !H) { W = 1280; H = 720 }
  if (!FPS) FPS = 30
  FPS = Math.round(FPS * 1000) / 1000

  // 9d. Bitrate + Encoder
  const qa = qualityArgs(options.quality, mainMeta, options.custom)
  const available = await detectEncoders()
  const codecFamily =
    String(mainMeta.videoCodec).toLowerCase().includes('265') ||
    String(mainMeta.videoCodec).toLowerCase().includes('hevc')
      ? 'hevc'
      : 'h264'
  const enc = pickEncoder(options.hardware, codecFamily, available, t)

  // 9e. Xây args
  const args = ['-hide_banner', '-y']
  const filterParts = []
  const concatRefs = []
  let inputIndex = 0
  const useConcat = hasIntro || hasOutro
  const subInput = subPlan.type === 'avs' ? subPlan.avsPath : options.mainVideo

  const pushSegment = (file, meta, isMain) => {
    const idx = inputIndex
    args.push('-i', file)
    inputIndex++
    let vFilter = null
    if (!isMain) vFilter = buildScalePadFilter(W, H, FPS)
    else if (options.quality === 'custom') vFilter = `scale=${W}:${H},fps=${FPS},setsar=1`
    if (isMain && subPlan.type === 'libass') vFilter = vFilter ? `${vFilter},${subPlan.filter}` : subPlan.filter
    let vref
    if (vFilter) {
      filterParts.push(`[${idx}:v]${vFilter}[v${idx}]`)
      vref = `[v${idx}]`
    } else {
      vref = `[${idx}:v]`
    }
    let aref
    if (meta.hasAudio) {
      aref = `[${idx}:a]`
    } else {
      const sIdx = inputIndex
      args.push('-f', 'lavfi', '-t', String(Math.max(0.1, meta.duration || 0.1)), '-i', 'anullsrc=r=48000:cl=stereo')
      inputIndex++
      aref = `[${sIdx}:a]`
    }
    concatRefs.push(vref + aref)
  }

  if (useConcat) {
    if (hasIntro) pushSegment(options.intro, metaMap.intro, false)
    pushSegment(subInput, mainMeta, true)
    if (hasOutro) pushSegment(options.outro, metaMap.outro, false)
    filterParts.push(`${concatRefs.join('')}concat=n=${concatRefs.length}:v=1:a=1[vout][aout]`)
    args.push('-filter_complex', filterParts.join(';'))
    args.push('-map', '[vout]', '-map', '[aout]')
  } else {
    args.push('-i', subInput)
    if (subPlan.type === 'libass') args.push('-vf', subPlan.filter)
    args.push('-map', '0:v:0')
    if (mainMeta.hasAudio) args.push('-map', '0:a:0')
  }

  // 9f. Video encoder — Constrained VBR
  args.push('-c:v', enc.encoder)
  if (enc.encoder === 'libx264' || enc.encoder === 'libx265') {
    const presets = { original: 'slow', high: 'slow', balanced: 'medium', small: 'fast', custom: 'medium' }
    args.push('-preset', presets[options.quality] || 'medium')
  } else if (enc.encoder.includes('nvenc')) {
    args.push('-rc', 'vbr', '-preset', 'p6', '-tune', 'hq', '-multipass', 'qres')
  } else if (enc.encoder.includes('qsv')) {
    args.push('-preset', 'medium')
  } else if (enc.encoder.includes('amf')) {
    args.push('-quality', 'quality')
  }
  // pix_fmt yuv420p để tương thích mọi trình phát
  args.push('-pix_fmt', 'yuv420p')
  args.push('-b:v', `${qa.bitrate}k`)
  args.push('-maxrate', `${qa.maxrate}k`)
  args.push('-bufsize', `${qa.bufsize}k`)

  // 9g. Audio — copy khi không ghép, re-encode khi concat/avs (đồng bộ chuẩn)
  if (useConcat || subPlan.type === 'avs') {
    args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000')
  } else if (mainMeta.hasAudio) {
    args.push('-c:a', 'copy')
  }

  // 9h. Container tối ưu
  const ext = path.extname(options.outputPath || '').toLowerCase()
  if (['.mp4', '.mov', '.m4v'].includes(ext)) args.push('-movflags', '+faststart')

  args.push(options.outputPath)
  return { args, mainMeta, subPlan, enc, qa, durationTotal, hasIntro, hasOutro }
}

// ─────────────────────────────────────────────────────────────
// 10. THỰC THI RENDER — GIAI ĐOẠN 4
//     spawn FFmpeg, parse stderr, đẩy progress/log về UI qua callbacks
// ─────────────────────────────────────────────────────────────
let currentChild = null
let cancelRequested = false

function formatDuration(secs) {
  secs = Math.max(0, Math.floor(secs || 0))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

async function startRender(options, events) {
  const t = makeT(options.lang)
  // Chuỗi thử: render đúng theo lựa chọn của người dùng; nếu AviSynth/VSFilter bị lỗi
  // runtime thì tự động render lại bằng libass (đảm bảo luôn có output cho người dùng).
  const attempts = [{ ...options }]
  if (options.subtitleEngine !== 'libass') {
    attempts.push({ ...options, subtitleEngine: 'libass' })
  }
  let lastError = null
  for (let i = 0; i < attempts.length; i++) {
    const outcome = await runRenderAttempt(attempts[i], events)
    if (outcome.kind === 'done' || outcome.kind === 'canceled') return
    lastError = outcome
    if (i < attempts.length - 1) {
      ;(events.onLog || (() => {}))(t('eng.retryLibass'), 'warn')
    }
  }
  ;(events.onError || (() => {}))(lastError || { message: t('eng.errGeneric') })
}

/** Thực thi MỘT lần render (một bộ options) → kết cục: done | canceled | {code,message,detail} */
async function runRenderAttempt(options, events) {
  const t = makeT(options.lang)
  const onLog = events.onLog || (() => {})
  const onProgress = events.onProgress || (() => {})
  const onDone = events.onDone || (() => {})
  cancelRequested = false

  onLog(t('eng.start'))
  let cmd = null
  try {
    onLog(t('eng.probing'))
    cmd = await buildRenderCommand(options)
    onLog(t('eng.mainMeta', { w: cmd.mainMeta.width, h: cmd.mainMeta.height, fps: cmd.mainMeta.fps, br: cmd.mainMeta.bitrateAvg }))
    if (cmd.subPlan.warning) onLog(cmd.subPlan.warning, 'warn')
    if (cmd.subPlan.note) onLog(cmd.subPlan.note, 'info')
    if (cmd.subPlan.type === 'avs') onLog(t('eng.avsOk', { dll: cmd.subPlan.dllName }), 'success')
    else onLog(t('eng.libassOk'))
    onLog(
      t('eng.encoder', {
        name: cmd.enc.encoder,
        label: cmd.enc.label,
        fallback: cmd.enc.fallback ? t('eng.fallbackTag') : '',
      })
    )
    onLog(t('eng.bitrate', { b: cmd.qa.bitrate, m: cmd.qa.maxrate, u: cmd.qa.bufsize }))
    if (cmd.hasIntro || cmd.hasOutro) {
      onLog(
        t('eng.merge', {
          n: (cmd.hasIntro ? 1 : 0) + 1 + (cmd.hasOutro ? 1 : 0),
          w: cmd.mainMeta.width,
          h: cmd.mainMeta.height,
          fps: cmd.mainMeta.fps,
        })
      )
    }
    onLog(t('eng.output', { path: options.outputPath }))
  } catch (e) {
    return { kind: 'error', message: e.message, detail: e.stack || '' }
  }

  const total = cmd.durationTotal
  const subPlanTemp = cmd.subPlan.type === 'avs' ? cmd.subPlan.avsPath : null

  return new Promise((resolveOutcome) => {
    let stderrBuf = ''
    const lastLines = []
    const removeAvs = () => {
      if (subPlanTemp) {
        try { fs.unlinkSync(subPlanTemp) } catch (e) {}
      }
    }
    try {
      currentChild = spawn(ffmpegPath, cmd.args, { windowsHide: true })
    } catch (err) {
      removeAvs()
      return resolveOutcome({ kind: 'error', message: t('eng.errStart', { msg: err.message }), detail: '' })
    }

    currentChild.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString('utf8')
      const lines = stderrBuf.split(/\r\n|\n|\r/)
      stderrBuf = lines.pop()
      for (const line of lines) {
        const t = line.trim()
        if (!t) continue
        if (t.includes('frame=') && t.includes('time=')) {
          const p = parseProgressLine(t, total)
          if (p) onProgress(p)
        } else {
          lastLines.push(t)
          if (/error|warning|fail|invalid|denied|cannot|unable|not found/i.test(t)) onLog(t)
        }
      }
      if (lastLines.length > 40) lastLines.splice(0, lastLines.length - 40)
    })

    currentChild.on('error', (err) => {
      removeAvs()
      currentChild = null
      resolveOutcome({ kind: 'error', message: t('eng.errRun', { msg: err.message }), detail: lastLines.slice(-10).join('\n') })
    })

    currentChild.on('close', (code) => {
      removeAvs()
      currentChild = null
      if (cancelRequested) {
        onLog(t('eng.canceled'), 'warn')
        onDone({ outputPath: options.outputPath, canceled: true })
        resolveOutcome({ kind: 'canceled' })
      } else if (code === 0) {
        onLog(t('eng.done', { dur: formatDuration(total) }), 'success')
        onDone({ outputPath: options.outputPath, duration: total })
        resolveOutcome({ kind: 'done' })
      } else {
        resolveOutcome({
          kind: 'error',
          code,
          message: t('eng.errExit', { code }),
          detail: lastLines.slice(-20).join('\n'),
        })
      }
    })
  })
}

function cancelRender() {
  cancelRequested = true
  if (currentChild && !currentChild.killed) {
    try {
      spawn('taskkill', ['/pid', String(currentChild.pid), '/T', '/F'], { windowsHide: true })
    } catch (e) {}
  }
}

// ─────────────────────────────────────────────────────────────
module.exports = {
  probeMedia,
  startRender,
  cancelRender,
  detectEncoders,
  buildRenderCommand,
  parseProgressLine,
  escapeFilterPath,
  formatDuration,
  qualityArgs,
}