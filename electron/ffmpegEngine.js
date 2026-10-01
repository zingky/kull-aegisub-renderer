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
// FFmpeg >= 5 in tiền tố IEC nhị phân: 439KiB / 12MiB / 1.4GiB (bản cũ: 439kB / 12MB).
// Regex cũ /size=\s*(\d+)(k|M|G)?B/ KHÔNG khớp "KiB" → sizeKB=null → log mất trường "dung lượng".
// Nhóm `i?` là tuỳ chọn nên khớp cả hai kiểu; `(\d+(?:\.\d+)?)` chịu được số thập phân.
const RE_SIZE = /size=\s*(\d+(?:\.\d+)?)\s*([kKmMgG])?i?[bB]/
const SZ_MULT = { k: 1, m: 1024, g: 1024 * 1024 }

// `elapsed` = số giây thực đã trôi qua kể từ lúc FFmpeg bắt đầu chạy (xem runRenderAttempt).
// Dùng để tính tốc độ TRUNG BÌNH → ETA ổn định. Bỏ trống/null thì ETA lùi về `speed` của ffmpeg.
function parseProgressLine(line, total, totalFrames, elapsed) {
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
    const mult = szm[2] ? SZ_MULT[szm[2].toLowerCase()] : 1
    sizeKB = Math.round(parseFloat(szm[1]) * mult)
  }
  const remaining = Math.max(0, total - secs)
  // ETA = thời gian THỰC còn lại:
  //  Ưu tiên (1) tốc độ TRUNG BÌNH = secs / elapsed. Ổn định, không nhảy loạn.
  //  `speed` của ffmpeg là cửa sổ NGẮN → dao động mạnh (2.56× rồi 0.32×) làm ETA
  //  nhảy từ 1min28s sang 6min5s rồi về 1min4s. avgSpeed là hằng số thật của cả render.
  //  (2) speed tức thời khi chưa đủ mốc thời gian (elapsed <= 2s) hoặc speed thiếu.
  //  (3) fps với TỔNG SỐ FRAME đầu ra (totalFrames) khi ffmpeg không in speed.
  //  TUYỆT ĐỐI không dùng remaining/fps: sai đơn vị (fps ~250 ⇒ ETA "1 giây"
  //  dù còn vài phút → đây chính là lỗi ETA hiển thị sai trước đây).
  const avgSpeed = elapsed > 2 && secs > 0 ? secs / elapsed : null
  if (avgSpeed > 0) eta = remaining / avgSpeed
  else if (speed && speed > 0) eta = remaining / speed
  else if (fps && fps > 0 && frame != null && totalFrames > 0) eta = Math.max(0, totalFrames - frame) / fps
  const timeStr = `${m[1]}:${m[2]}:${m[3]}`
  return { progress, fps, speed, avgSpeed, eta, frame, bitrate, sizeKB, time: timeStr }
}

// ─────────────────────────────────────────────────────────────
// 4. PHÁT HIỆN NĂNG LỰC MÁY (cache 1 lần)
//    - Encoder GPU: PROBE ENCODE THẬT (xem ghi chú probeEncoder bên dưới)
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

//  KÍCH THƯỚC TỐI THIỂU 256x256 — KHÔNG được giảm.
//    NVENC/AMF/QSV từ chối frame quá nhỏ (64x64 → "Invalid parameters"), nên probe
//    quá nhỏ cho kết quả FAIL GIẢ. 256x256 là bội số 16/32 mà cả 3 backend chấp nhận.
const PROBE_SIZE = '256x256'
const PROBE_TIMEOUT_MS = 8000

/**
 * PROBE ENCODE THẬT cho 1 encoder → true nếu mở device + encode 1 frame thành công.
 *
 *  VÌ SAO KHÔNG DÙNG `ffmpeg -encoders`:
 *    `-encoders` chỉ liệt kê encoder ĐÃ BUILD, KHÔNG kiểm tra GPU/driver.
 *    FFmpeg 9 bản gyan.dev build `--enable-amf` nên luôn in ra `h264_amf` dù máy
 *    không có GPU AMD → app hiển thị "AMF khả dụng", người dùng chọn xong render
 *    chết ngay với `[AMF] DLL amfrt64.dll failed to open`. Tương tự QSV khi thiếu
 *    iGPU/driver Intel. Grep tên ⇒ false positive. Chỉ encode thật mới phân biệt được.
 *
 *  Chi phí: NVENC ~0.29s, QSV ~1.23s, AMF fail nhanh ~0.07s — chạy SONG SONG 1 lần
 *  rồi cache, không ảnh hưởng thời gian render.
 */
function probeEncoder(encoder) {
  return new Promise((resolve) => {
    let child
    let done = false
    let reason = ''
    const finish = (ok) => {
      if (done) return
      done = true
      clearTimeout(timer)
      try { child.kill() } catch (e) {}
      // Ghi lý do để chẩn đoán được "sao không thấy AMF/QSV" mà không cần bật app.
      if (!ok) console.warn(`[encoder-probe] ${encoder} KHÔNG dùng được: ${reason || 'unknown'}`)
      resolve(ok)
    }
    const timer = setTimeout(() => { reason = `timeout ${PROBE_TIMEOUT_MS}ms`; finish(false) }, PROBE_TIMEOUT_MS)
    try {
      child = spawn(
        ffmpegPath,
        [
          '-hide_banner', '-nostdin', '-loglevel', 'error',
          '-f', 'lavfi', '-i', `color=c=black:s=${PROBE_SIZE}:r=1:d=1`,
          '-frames:v', '1', '-c:v', encoder,
          '-f', 'null', '-',
        ],
        { windowsHide: true }
      )
    } catch (e) {
      reason = e.message
      return finish(false)
    }
    let stderr = ''
    child.stderr.on('data', (d) => { if (stderr.length < 2048) stderr += d.toString('utf8') })
    child.on('error', (e) => { reason = e.message; finish(false) })
    // exit 0 ⇒ thật sự mở được hardware device và encode được frame.
    child.on('close', (code) => {
      if (code !== 0) reason = (stderr.trim().split('\n').pop() || `exit ${code}`).slice(0, 300)
      finish(code === 0)
    })
  })
}

/**
 * Danh sách backend GPU dùng ĐƯỢC THẬT + 'cpu' luôn ở cuối.
 * Gọi song song 3 probe để giới hạn độ trễ khởi động (~1.3s, tức là lần chạm NVENC đầu tiên).
 */
async function detectEncoders() {
  if (encoderCache) return encoderCache
  const [nvenc, qsv, amf] = await Promise.all([
    probeEncoder('h264_nvenc'),
    probeEncoder('h264_qsv'),
    probeEncoder('h264_amf'),
  ])
  encoderCache = []
  if (nvenc) encoderCache.push('nvenc')
  if (qsv) encoderCache.push('qsv')
  if (amf) encoderCache.push('amf')
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
//        LoadPlugin("bin/VSFilterMod.dll") + DirectShowSource + TextSubMod
//    - TÊN HÀM khác nhau tuỳ bản build (đã kiểm chứng bằng preflight + render thật):
//        VSFilterMod.dll (build _VSMOD: sorayuki 5.2.x / Masaiki 5.3.x) → TextSubMod
//        VSFilter.dll    (xy-VSFilter, VSFilter cổ điển)                → TextSub
//      Gọi sai tên hàm ⇒ AviSynth báo "there is no function named ..." ⇒ FFmpeg thoát
//      lỗi ⇒ app lặng lẽ rơi về libass (MẤT hiệu ứng \t, \move, karaoke… của Aegisub).
//    - Nếu thiếu AviSynth+ hoặc FFmpeg thiếu avisynth demuxer
//      => cảnh báo và fallback sang libass (vẫn render được).
//    - libass: filter subtitles nội bộ, path đã escape theo chuẩn Windows.
// ─────────────────────────────────────────────────────────────
/** Tên hàm TextSub chính của DLL theo bản build (VSFilterMod → TextSubMod). */
function avsSubFnName(dllPath) {
  return /vsfiltermod/i.test(path.basename(String(dllPath))) ? 'TextSubMod' : 'TextSub'
}

/** Tên hàm còn lại — dùng khi DLL không có hàm chính (bản build lạ). */
function avsSubFnAlt(dllPath) {
  return avsSubFnName(dllPath) === 'TextSubMod' ? 'TextSub' : 'TextSubMod'
}

function createAvsScript(mainVideo, subtitlePath, dllPath, meta, fnName) {
  const toFwd = (p) => String(p).replace(/\\/g, '/')
  const fn = fnName || avsSubFnName(dllPath)
  const lines = ['SetFilterMTMode("DEFAULT_MT_MODE", 2)']
  lines.push(`LoadPlugin("${toFwd(dllPath)}")`)
  // AviSynth+ 3.7.x tách DirectShowSource thành plugin riêng — load kèm nếu có
  const dss = resolveBin('avsplugins/DirectShowSource.dll')
  if (dss) lines.push(`LoadPlugin("${toFwd(dss)}")`)
  lines.push(`DirectShowSource("${toFwd(mainVideo)}", fps=${meta?.fps || 23.976}, convertfps=true)`)
  lines.push(`${fn}("${toFwd(subtitlePath)}")`)
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
 *    + Ưu tiên đúng DLL đã chọn, và ưu tiên đúng tên hàm của bản build
 *      (VSFilterMod.dll → TextSubMod, VSFilter.dll → TextSub).
 *    + DLL không nạp được / không có hàm TextSub(Mod) → tự thử DLL còn lại.
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
        // Thử ĐÚNG tên hàm của bản build trước (VSFilterMod → TextSubMod, xy-VSFilter
        // → TextSub), rồi mới thử tên còn lại (DLL build lạ / plugin cũ).
        for (const fn of [avsSubFnName(dll), avsSubFnAlt(dll)]) {
          const avsPath = createAvsScript(mainVideo, subtitlePath, dll, meta, fn)
          const ok = await preflightAvs(avsPath)
          if (ok) {
            return {
              type: 'avs',
              dll,
              dllName,
              fn,
              avsPath,
              note: dllName === preferred ? null : t('eng.swapNote', { preferred, dll: dllName }),
              warning: null,
            }
          }
          try { fs.unlinkSync(avsPath) } catch (e) {}
        }
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
  // TRIM: cắt đoạn A→B của video chính (giây)
  const trim = options.trim && options.trim.enabled && options.trim.end > options.trim.start
    ? { start: Number(options.trim.start), end: Number(options.trim.end) }
    : null
  if (trim) {
    mainMeta.trimOffset = trim.start
    mainMeta.duration = Math.max(0.1, trim.end - trim.start)
    mainMeta.trimmed = true
  }
  const metaMap = { main: mainMeta }
  let durationTotal = mainMeta.duration
  // Intro/Outro: chỉ cần có file là ghép, trừ khi UI nói rõ đang tắt (`mergeEnabled === false`).
  // (UI cũ chỉ gửi file khi đã tick, nên đừng bắt buộc phải có cờ mergeEnabled.)
  const hasIntro = !!options.intro && options.mergeEnabled !== false
  const hasOutro = !!options.outro && options.mergeEnabled !== false
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

  // FADE: tùy chọn fade in/out từng phân đoạn (options.fades = { enabled, duration })
  const fades = options.fades && options.fades.enabled && Number(options.fades.duration) > 0
    ? { d: Math.max(0.05, Math.min(3, Number(options.fades.duration))) }
    : null
  const fadeChain = (segDur, isFirst, isLast) => {
    if (!fades) return ''
    const parts = []
    if (isFirst) parts.push(`fade=t=in:st=0:d=${fades.d}`)
    if (isLast && segDur > fades.d) parts.push(`fade=t=out:st=${Math.max(0, segDur - fades.d).toFixed(3)}:d=${fades.d}`)
    return parts.length ? parts.join(',') + ',' : ''
  }
  const audioFadeChain = (segDur, isFirst, isLast) => {
    if (!fades) return ''
    const parts = []
    if (isFirst) parts.push(`afade=t=in:st=0:d=${fades.d}`)
    if (isLast && segDur > fades.d) parts.push(`afade=t=out:st=${Math.max(0, segDur - fades.d).toFixed(3)}:d=${fades.d}`)
    return parts.length ? parts.join(',') + ',' : ''
  }
  let audioFaded = false // cần re-encode audio khi có fade

  const pushSegment = (file, meta, isMain, isFirst, isLast) => {
    // TRIM: -ss A -t (B-A) áp vào input video chính (input options — trước -i)
    if (isMain && trim) {
      args.push('-ss', String(trim.start), '-t', String(Math.max(0.1, trim.end - trim.start)))
    }
    const idx = inputIndex
    args.push('-i', file)
    inputIndex++
    const segDur = meta.duration || mainMeta.duration || 0
    const vFade = fades ? fadeChain(segDur, isFirst, isLast) : ''
    const aFade = fades ? audioFadeChain(segDur, isFirst, isLast) : ''
    if (aFade) audioFaded = true
    let vFilter = null
    if (!isMain) vFilter = buildScalePadFilter(W, H, FPS)
    else if (options.quality === 'custom') vFilter = `scale=${W}:${H},fps=${FPS},setsar=1`
    if (isMain && subPlan.type === 'libass') vFilter = vFilter ? `${vFilter},${subPlan.filter}` : subPlan.filter
    if (vFade) vFilter = vFilter ? `${vFade}${vFilter}` : vFade.replace(/,$/, '')
    let vref
    if (vFilter) {
      filterParts.push(`[${idx}:v]${vFilter}[v${idx}]`)
      vref = `[v${idx}]`
    } else {
      vref = `[${idx}:v]`
    }
    let aref
    if (meta.hasAudio) {
      if (aFade) {
        filterParts.push(`[${idx}:a]${aFade.replace(/,$/, '')}[a${idx}]`)
        aref = `[a${idx}]`
      } else {
        aref = `[${idx}:a]`
      }
    } else {
      const sIdx = inputIndex
      args.push('-f', 'lavfi', '-t', String(Math.max(0.1, meta.duration || 0.1)), '-i', 'anullsrc=r=48000:cl=stereo')
      inputIndex++
      aref = `[${sIdx}:a]`
    }
    concatRefs.push(vref + aref)
  }

  if (useConcat) {
    if (hasIntro) pushSegment(options.intro, metaMap.intro, false, true, !hasOutro)
    pushSegment(subInput, mainMeta, true, !hasIntro, !hasOutro)
    if (hasOutro) pushSegment(options.outro, metaMap.outro, false, false, true)
    filterParts.push(`${concatRefs.join('')}concat=n=${concatRefs.length}:v=1:a=1[vout][aout]`)
    args.push('-filter_complex', filterParts.join(';'))
    args.push('-map', '[vout]', '-map', '[aout]')
  } else {
    // TRIM: input options áp cho input video chính duy nhất
    if (trim) args.push('-ss', String(trim.start), '-t', String(Math.max(0.1, trim.end - trim.start)))
    args.push('-i', subInput)
    const vFade = fades ? fadeChain(mainMeta.duration, true, true).replace(/,$/, '') : ''
    const aFade = fades ? audioFadeChain(mainMeta.duration, true, true).replace(/,$/, '') : ''
    if (aFade) audioFaded = true
    let vf = subPlan.type === 'libass' ? subPlan.filter : null
    if (options.quality === 'custom') vf = vf ? `scale=${W}:${H},fps=${FPS},setsar=1,${vf}` : `scale=${W}:${H},fps=${FPS},setsar=1`
    if (vFade) vf = vf ? `${vFade},${vf}` : vFade
    if (vf) args.push('-vf', vf)
    args.push('-map', '0:v:0')
    if (mainMeta.hasAudio) {
      args.push('-map', '0:a:0')
      if (aFade) args.push('-af', aFade)
    }
  }

  // 9f. Video encoder — Constrained VBR
  // WEBM chỉ nhận VP8/VP9/AV1 + Vorbis/Opus. Nếu ép H.264/AAC vào .webm thì
  // ffmpeg exit -22 "Could not write header" và KHÔNG tạo được file. Vì vậy
  // khi user chọn WebM phải đổi hẳn codec, không phải chỉ đổi đuôi file.
  const isWebM = path.extname(options.outputPath || '').toLowerCase() === '.webm'
  if (isWebM) {
    args.push('-c:v', 'libvpx-vp9', '-b:v', `${qa.bitrate}k`, '-maxrate', `${qa.maxrate}k`,
      '-bufsize', `${qa.bufsize}k`, '-pix_fmt', 'yuv420p', '-row-mt', '1', '-cpu-used', '2')
  } else {
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
  }

  // 9g. Audio — copy khi không ghép, re-encode khi concat/avs/fade (đồng bộ chuẩn)
  if (isWebM) {
    if (mainMeta.hasAudio) args.push('-c:a', 'libopus', '-b:a', '128k')
  } else if (useConcat || subPlan.type === 'avs' || audioFaded) {
    args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000')
  } else if (mainMeta.hasAudio) {
    args.push('-c:a', 'copy')
  }

  // 9h. Container tối ưu
  const ext = path.extname(options.outputPath || '').toLowerCase()
  if (['.mp4', '.mov', '.m4v'].includes(ext)) args.push('-movflags', '+faststart')

  args.push(options.outputPath)
  return { args, mainMeta, subPlan, enc, qa, durationTotal, fps: FPS, hasIntro, hasOutro }
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

/**
 * Thời gian thực đã mất khi render (wall-clock), dạng "9m 51s" / "1h 04m".
 * KHÔNG dùng nhầm với formatDuration (thời lượng video) — log "Tổng thời lượng 00:03:58"
 * khiến người dùng tưởng render xong trong 3:58 dù thực tế phải chờ 9m51s.
 */
function formatElapsed(secs) {
  secs = Math.max(0, Math.round(secs || 0))
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = String(secs % 60).padStart(2, '0')
  if (m < 60) return s === '00' ? `${m}m` : `${m}m ${s}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

// Ghi file output nằm trong thư mục đồng bộ đám mây (OneDrive/Dropbox/Google Drive…) thì
// tiến trình sync liên tục scan + upload file đang lớn dần → render chậm dần theo tiến độ.
// Chỉ là gợi ý (không chặn render): trả về tên thư mục nếu trúng, '' nếu không.
const CLOUD_SYNC_MARKERS = ['onedrive', 'dropbox', 'google drive', 'googledrive', 'icloud', 'nextcloud', 'owncloud', 'pcloud', 'sugarsync', 'mega']
function detectCloudSync(outputPath) {
  if (!outputPath) return ''
  const p = String(outputPath).toLowerCase()
  return CLOUD_SYNC_MARKERS.find((m) => p.includes(m)) || ''
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
    if (cmd.subPlan.type === 'avs') onLog(t('eng.avsOk', { dll: cmd.subPlan.dllName, fn: cmd.subPlan.fn || 'TextSub' }), 'success')
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
    // Gợi ý (không chặn): output nằm trong thư mục sync đám mây → thường chậm hơn nhiều
    const cloud = detectCloudSync(options.outputPath)
    if (cloud) onLog(t('eng.cloudSync', { name: cloud }), 'warn')
  } catch (e) {
    return { kind: 'error', message: e.message, detail: e.stack || '' }
  }

  const total = cmd.durationTotal
  // Tổng số frame đầu ra — dùng cho ETA dự phòng khi ffmpeg không in `speed=`
  const outFps = cmd.fps || cmd.mainMeta.fps || 0
  const totalFrames = total > 0 && outFps > 0 ? Math.round(total * outFps) : 0
  const subPlanTemp = cmd.subPlan.type === 'avs' ? cmd.subPlan.avsPath : null

  return new Promise((resolveOutcome) => {
    let stderrBuf = ''
    const lastLines = []
    // Mốc thời gian CHẠY THẬT (đặt ngay trước spawn, không tính phần probe/lắp ráp lệnh)
    // → elapsed là wall-clock thực của render, dùng cho ETA ổn định + thời gian đã mất.
    const startedAt = Date.now()
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
          const p = parseProgressLine(t, total, totalFrames, (Date.now() - startedAt) / 1000)
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
        // Báo CẢ thời lượng video LẪN thời gian thực đã chờ — trước đây chỉ in thời lượng
        // video khiến "Tổng thời lượng 00:03:58" bị hiểu là render mất 3 phút 58 giây.
        const elapsed = (Date.now() - startedAt) / 1000
        onLog(t('eng.done', { dur: formatDuration(total), took: formatElapsed(elapsed) }), 'success')
        onDone({ outputPath: options.outputPath, duration: total, elapsed })
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

// ── Dọn rác .avs sót lại ─────────────────────────────────────
// File .avs tạm chỉ bị sót khi render bị kill đột ngột (app đóng cứng, mất điện…).
// Gọi lúc app khởi động — lúc này không có render nào chạy nên mọi file sót đều là rác.
function cleanupStaleAvs() {
  let removed = 0
  try {
    for (const name of fs.readdirSync(os.tmpdir())) {
      if (name.startsWith('kull_vietsub_') && name.endsWith('.avs')) {
        try { fs.unlinkSync(path.join(os.tmpdir(), name)); removed++ } catch (e) {}
      }
    }
  } catch (e) {}
  return removed
}

// ─────────────────────────────────────────────────────────────
// 11. EXPORT CLIP CẮT A→B — video riêng, KHÔNG phụ đề,
//     giữ định dạng gốc (container + codec family + thông số gốc)
// ─────────────────────────────────────────────────────────────
async function exportTrimClip(options, events) {
  const t = makeT(options.lang)
  const onLog = events.onLog || (() => {})
  const onProgress = events.onProgress || (() => {})
  const onDone = events.onDone || (() => {})
  const onError = events.onError || (() => {})
  cancelRequested = false

  const start = Number(options.trim?.start)
  const end = Number(options.trim?.end)
  if (!isFinite(start) || !isFinite(end) || end <= start) {
    onError({ message: t('eng.errGeneric'), detail: 'Invalid trim range' })
    return
  }
  const dur = end - start

  onLog(t('eng.start'))
  let meta
  try {
    onLog(t('eng.probing'))
    meta = await probeMedia(options.mainVideo, options.lang)
  } catch (e) {
    onError({ message: e.message, detail: '' })
    return
  }

  // Codec giữ nguyên family gốc; chất lượng theo file gốc (Constrained VBR)
  const codecFamily = String(meta.videoCodec).toLowerCase().includes('265') ||
    String(meta.videoCodec).toLowerCase().includes('hevc') ? 'libx265' : 'libx264'
  const available = await detectEncoders()
  const gpu = available.includes('nvenc') ? 'h264_nvenc' : available.includes('qsv') ? 'h264_qsv' : available.includes('amf') ? 'h264_amf' : null
  const encoder = gpu && codecFamily === 'libx264' ? gpu : codecFamily

  const qa = qualityArgs('original', meta, null)
  const args = ['-hide_banner', '-y', '-ss', String(start), '-t', String(dur), '-i', options.mainVideo]
  // Độ chính xác frame: decode lại toàn bộ (seek input nhanh + accurate_seek mặc định)
  args.push('-map', '0:v:0')
  if (meta.hasAudio) args.push('-map', '0:a:0')
  // WebM chỉ nhận VP8/VP9/AV1 + Vorbis/Opus — ép H.264/AAC sẽ fail exit -22,
  // không tạo được file. Xem giải thích ở buildRenderCommand (9f).
  const clipIsWebM = path.extname(options.outputPath || '').toLowerCase() === '.webm'
  if (clipIsWebM) {
    args.push('-c:v', 'libvpx-vp9', '-row-mt', '1', '-cpu-used', '2')
  } else {
    args.push('-c:v', encoder)
    if (encoder === 'libx264' || encoder === 'libx265') args.push('-preset', 'slow')
    else if (encoder.includes('nvenc')) args.push('-rc', 'vbr', '-preset', 'p6', '-tune', 'hq')
    else if (encoder.includes('qsv')) args.push('-preset', 'medium')
    else if (encoder.includes('amf')) args.push('-quality', 'quality')
  }
  args.push('-pix_fmt', 'yuv420p')
  args.push('-b:v', `${qa.bitrate}k`, '-maxrate', `${qa.maxrate}k`, '-bufsize', `${qa.bufsize}k`)
  if (meta.hasAudio) {
    args.push('-c:a', clipIsWebM ? 'libopus' : 'aac', '-b:a', clipIsWebM ? '128k' : '192k')
    // Chặn đỉnh âm thanh về -1.5 dBFS để Facebook không méo tiếng khi re-encode.
    // 0.8413 = 10^(-1.5/20). Facebook chuẩn hóa về -14 LUFS (~-6.5 dB) rồi nén lại;
    // đỉnh vượt 0 dBFS bị méo thành tiếng "rè" dù nghe trên VLC thấy bình thường.
    args.push('-af', 'alimiter=limit=0.8413:level=disabled:latency=true')
  }
  const ext = path.extname(options.outputPath || '').toLowerCase()
  if (['.mp4', '.mov', '.m4v'].includes(ext)) args.push('-movflags', '+faststart')
  args.push(options.outputPath)
  onLog(t('eng.output', { path: options.outputPath }))
  const cloudClip = detectCloudSync(options.outputPath)
  if (cloudClip) onLog(t('eng.cloudSync', { name: cloudClip }), 'warn')

  return new Promise((resolveOutcome) => {
    let child
    try {
      child = spawn(ffmpegPath, args, { windowsHide: true })
    } catch (err) {
      onError({ message: t('eng.errStart', { msg: err.message }), detail: '' })
      return resolveOutcome({ kind: 'error' })
    }
    currentChild = child
    const clipStartedAt = Date.now()
    let last = ''
    child.stderr.on('data', (chunk) => {
      last += chunk.toString('utf8')
      const lines = last.split(/\r\n|\n|\r/)
      last = lines.pop()
      for (const line of lines) {
        if (line.includes('frame=') && line.includes('time=')) {
          const p = parseProgressLine(line, dur, 0, (Date.now() - clipStartedAt) / 1000)
          if (p) onProgress(p)
        }
      }
    })
    child.on('error', (err) => {
      currentChild = null
      onError({ message: t('eng.errRun', { msg: err.message }), detail: '' })
      resolveOutcome({ kind: 'error' })
    })
    child.on('close', (code) => {
      currentChild = null
      if (cancelRequested) {
        onLog(t('eng.canceled'), 'warn')
        onDone({ outputPath: options.outputPath, canceled: true })
        return resolveOutcome({ kind: 'canceled' })
      }
      if (code === 0) {
        const clipElapsed = (Date.now() - clipStartedAt) / 1000
        onLog(t('eng.done', { dur: formatDuration(dur), took: formatElapsed(clipElapsed) }), 'success')
        onDone({ outputPath: options.outputPath, duration: dur, elapsed: clipElapsed })
        resolveOutcome({ kind: 'done' })
      } else {
        onError({ message: t('eng.errExit', { code }), detail: last.slice(-800) })
        resolveOutcome({ kind: 'error' })
      }
    })
  })
}

// ── Thumbnail timeline cho Trim (trả về mảng {t, file}) ──────
async function extractThumbs(videoPath, count = 20) {
  const meta = await probeMedia(videoPath, 'vi')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kull_thumbs_'))
  const thumbs = []
  const n = Math.max(2, Math.min(40, count))
  for (let i = 0; i < n; i++) {
    const t = (meta.duration * i) / n
    const file = path.join(dir, `th_${String(i).padStart(3, '0')}.jpg`)
    // spawn tuần tự (nhẹ, tránh 20 tiến trình cùng lúc)
    await new Promise((resolve) => {
      let c
      try {
        c = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', videoPath, '-frames:v', '1', '-vf', 'scale=160:-2', '-q:v', '5', '-y', file], { windowsHide: true })
      } catch (e) { return resolve() }
      c.on('error', () => resolve())
      c.on('close', () => resolve())
    })
    if (fs.existsSync(file) && fs.statSync(file).size > 0) thumbs.push({ t, file })
  }
  return { thumbs, dir }
}

function cleanupThumbs(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch (e) {}
}

// ─────────────────────────────────────────────────────────────
module.exports = {
  probeMedia,
  startRender,
  cancelRender,
  detectEncoders,
  pickEncoder,
  buildRenderCommand,
  parseProgressLine,
  escapeFilterPath,
  formatDuration,
  formatElapsed,
  detectCloudSync,
  qualityArgs,
  cleanupStaleAvs,
  exportTrimClip,
  extractThumbs,
  cleanupThumbs,
  // Dùng cho preview frame qua AviSynth (main.js) — tránh lặp lại logic sinh .avs
  createAvsScript,
  avsSubFnName,
  avsSubFnAlt,
}