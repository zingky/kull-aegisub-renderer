/**
 * e2eTest.js — Kiểm thử End-to-End Core Engine (chạy độc lập, không cần Electron GUI)
 *
 *  1. Tạo video mẫu + subtitle .ass bằng đúng ffmpeg.exe trong bin/
 *  2. Kiểm tra probeMedia (đọc thông số gốc)
 *  3. Kiểm tra lắp ráp câu lệnh (bao gồm ghép Intro/Outro concat)
 *  4. Render thật → kiểm tra file output tồn tại
 *  5. Đơn vị: escapeFilterPath, parseProgressLine, qualityArgs
 */
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const engine = require('../electron/ffmpegEngine')
const { ffmpegPath } = require('../electron/paths')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kull-e2e-'))
// Tự dọn thư mục test khi process kết thúc (dù pass hay lỗi)
process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }) } catch (e) {} })
const video = path.join(dir, 'sample.mp4')
const outro = path.join(dir, 'outro.mp4')
const sub = path.join(dir, 'sub.ass')
const output = path.join(dir, 'output_merged.mp4')

function run(bin, args) {
  return spawnSync(bin, args, { encoding: 'utf8' })
}

async function main() {
  console.log('══════════ E2E TEST — KULL AEGISUB RENDERER ══════════\n')

  // ── 1. Tạo media mẫu ──
  console.log('[1] Tạo video mẫu...')
  let r = run(ffmpegPath, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x480:rate=24:duration=10',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=10', '-c:v', 'libx264', '-preset', 'veryfast',
    '-c:a', 'aac', '-shortest', video])
  console.log('    video chính status:', r.status)
  r = run(ffmpegPath, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x480:rate=24:duration=3',
    '-f', 'lavfi', '-i', 'sine=frequency=220:duration=3', '-c:v', 'libx264', '-preset', 'veryfast',
    '-c:a', 'aac', '-shortest', outro])
  console.log('    outro status:', r.status)

  fs.writeFileSync(sub, [
    '[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 640', 'PlayResY: 480', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,Arial,28,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,20,20,24,1', '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    'Dialogue: 0,0:00:00.50,0:00:09.50,Default,,0,0,0,,{\\b1}Kull Vietsub E2E{\\b0} Render OK',
  ].join('\r\n'), 'utf8')
  console.log('    subtitle .ass đã tạo')

  // ── 2. Probe ──
  console.log('\n[2] probeMedia(video chính):')
  const meta = await engine.probeMedia(video)
  console.log('   ', JSON.stringify(meta))
  if (meta.width !== 640 || meta.height !== 480) throw new Error('Sai resolution khi probe!')

  // ── 3. Build command ──
  console.log('\n[3] buildRenderCommand (libass + ghép outro):')
  const cmd = await engine.buildRenderCommand({
    mainVideo: video,
    subtitle: sub,
    intro: null,
    outro,
    mergeEnabled: true,
    subtitleEngine: 'libass',
    hardware: 'cpu',
    quality: 'original',
    custom: { resolution: '640x480', fps: '24', bitrate: '600' },
    outputPath: output,
  })
  console.log('    encoder:', cmd.enc.encoder, '#', cmd.enc.label)
  console.log('    qa:', JSON.stringify(cmd.qa))
  console.log('    filter_complex hiện diện:', cmd.args.some((a) => a.includes('concat=n=')))
  console.log('    args:\n    ', cmd.args.join(' '))

  // ── 4. Render thật ──
  console.log('\n[4] Render thực tế...')
  await new Promise((resolve) => {
    engine.startRender(
      {
        mainVideo: video,
        subtitle: sub,
        intro: null,
        outro,
        mergeEnabled: true,
        subtitleEngine: 'libass',
        hardware: 'cpu',
        quality: 'original',
        custom: { resolution: '640x480', fps: '24', bitrate: '600' },
        outputPath: output,
      },
      {
        onLog: (l, lvl) => console.log(`    [${lvl || 'info'}] ${l}`),
        onProgress: (p) => process.stdout.write(`\r    ${p.progress}% | fps=${(p.fps || 0).toFixed(1)} | speed=${(p.speed || 0).toFixed(2)}x | eta=${(p.eta || 0).toFixed(1)}s `),
        onDone: (d) => { console.log('\n    ✅ onDone:', JSON.stringify(d)); resolve() },
        onError: (e) => { console.log('\n    ❌ onError:', JSON.stringify(e)); process.exitCode = 1; resolve() }
      }
    )
  })
  const stat = fs.existsSync(output) ? fs.statSync(output) : null
  console.log('    output tồn tại:', !!stat, stat ? `(${(stat.size / 1024).toFixed(1)} KB)` : '')

  // Probe lại output để xác nhận hợp lệ
  const outMeta = await engine.probeMedia(output)
  console.log('    output probe:', outMeta.width + 'x' + outMeta.height, '@' + outMeta.fps + 'fps', 'audio=' + (outMeta.hasAudio ? 'có' : 'không'), 'dur=' + outMeta.duration.toFixed(1) + 's')
  if (!stat) throw new Error('KHÔNG TẠO RA FILE OUTPUT!')

  // ── 5. Unittest nhỏ ──
  console.log('\n[5] Unit test:')
  console.log('    escapeFilterPath:', engine.escapeFilterPath('C:\\My Folder\\a b.ass') === `C\\:/My Folder/a b.ass` ? 'PASS' : 'FAIL')
  const pp = engine.parseProgressLine('frame=  120 fps= 45.6 q=28.0 size= 128KB time=00:00:05.00 bitrate= 200kbits/s speed=1.5x', 10)
  console.log('    parseProgressLine:', pp && pp.progress === 50 && pp.fps === 45.6 ? 'PASS' : 'FAIL', pp)
  const qa = engine.qualityArgs('original', { bitrateAvg: 1000 }, null)
  console.log('    qualityArgs(original, 1000k):', qa.bitrate === 1000 && qa.maxrate === 1250 && qa.bufsize === 2000 ? 'PASS' : 'FAIL', qa)

  // ── 5b. Hồi quy: `size=` của FFmpeg >= 5 dùng tiền tố IEC (KiB/MiB/GiB) ──
  // Regex cũ /size=\s*(\d+)(k|M|G)?B/ không khớp "KiB" → sizeKB=null → mất trường "dung lượng" trong log.
  console.log('\n[5b] Hồi quy size= (tiền tố IEC của FFmpeg >= 5):')
  const sizeCases = [
    ['size=     439KiB', 439],        // FFmpeg 9 thực tế
    ['size=      12MiB', 12 * 1024],
    ['size=       1kB', 1],           // FFmpeg bản cũ — vẫn phải khớp
    ['size=     128KB', 128],         // khoá cũ trong test e2e
    ['size=     1.4GiB', Math.round(1.4 * 1024 * 1024)],
    ['size=      0KiB', 0],           // dòng đầu tiên, 0 byte
  ]
  let sizeFail = 0
  for (const [frag, want] of sizeCases) {
    const line = `frame=  120 fps= 45.6 q=28.0 ${frag} time=00:00:05.00 bitrate= 200kbits/s speed=1.5x`
    const r = engine.parseProgressLine(line, 10)
    const ok = r && r.sizeKB === want
    console.log(`    ${ok ? 'PASS' : 'FAIL'}  "${frag}" → sizeKB=${r && r.sizeKB} (cần ${want})`)
    if (!ok) sizeFail++
  }
  if (sizeFail) { process.exitCode = 1; console.error(`  ❌ ${sizeFail} ca size= sai`) }

  // ── 5c. Hồi quy: ETA theo tốc độ TRUNG BÌNH, đo SAI SỐ so với thực tế ──
  // Dữ liệu từ log render thật 1080p60, 14304 frame / 238.4s, tổng wall-clock 588s
  // (02:19:49 → 02:29:37). "Còn lại thực" tại mốc i = 588 - elapsed[i].
  // ETA cũ = remaining / speed(tức thời) → dao động mạnh vì speed là cửa sổ NGẮN của ffmpeg.
  // ETA mới = remaining / (secs/elapsed) → tốc độ TRUNG BÌNH, hội tụ về hằng số thật của render.
  console.log('\n[5c] Hồi quy ETA (đo sai số so với thực tế trong log):')
  const TOTAL = 238.4
  const WALL = 588
  const mmss = (s) => `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s`
  const rows = [
    // [giây video đã xử lý, giây thực đã trôi qua, speed tức thời của ffmpeg]
    [11.86, 8, 2.56],
    [23.87, 30, 0.87],
    [35.73, 61, 0.62],
    [59.60, 125, 0.49],
    [119.18, 294, 0.41],
    [178.66, 522, 0.34],
    [227.43, 585, 0.39],
  ]
  let etaFail = 0
  const tstamp = (secs) => `00:${String(Math.floor(secs / 60)).padStart(2, '0')}:${(secs % 60).toFixed(2).padStart(5, '0')}`
  const newEtas = []
  const oldEtas = []
  const real = []
  for (const [secs, elapsed, sp] of rows) {
    const line = `frame=  1000 fps= 20.0 size=     439KiB time=${tstamp(secs)} bitrate= 4500kbits/s speed=${sp}x`
    const r = engine.parseProgressLine(line, TOTAL, 0, elapsed)
    newEtas.push(r.eta)
    oldEtas.push((TOTAL - secs) / sp)
    real.push(WALL - elapsed)
    console.log(`    video=${secs.toFixed(1).padStart(6)}s elapsed=${String(elapsed).padStart(3)}s  còn lại thực=${mmss(WALL - elapsed).padStart(6)}  |  ETA cũ=${mmss(oldEtas[oldEtas.length - 1]).padStart(6)}  ETA mới=${mmss(r.eta).padStart(6)}`)
  }
  // (a) Mốc 50% — render đã vào nhịp ổn định → ETA phải gần như tuyệt đối chính xác.
  if (Math.abs(newEtas[4] - 294) > 5) { etaFail++; console.error(`  ❌ ETA tại 50% = ${mmss(newEtas[4])}, cần ≈4m54s (294s)`) }
  else console.log(`    PASS  ETA tại 50% = ${mmss(newEtas[4])} — khớp gần tuyệt đối với "còn lại thực" ${mmss(real[4])}`)
  // (b) Tổng sai số so với thực tế: bản mới phải nhỏ hơn bản cũ.
  const err = (est) => est.reduce((sum, e, i) => sum + Math.abs(e - real[i]), 0)
  const eNew = err(newEtas)
  const eOld = err(oldEtas)
  console.log(`    Tổng sai số: cũ ${mmss(eOld)} → mới ${mmss(eNew)}`)
  if (!(eNew < eOld)) { etaFail++; console.error('  ❌ ETA mới không tốt hơn ETA cũ') }
  else console.log('    PASS  ETA mới có sai số nhỏ hơn')
  // (c) Nửa sau render (nhịp ổn định) ETA chỉ được giảm — không "nhảy ngược".
  let bumps = 0
  for (let i = 5; i < newEtas.length; i++) if (newEtas[i] > newEtas[i - 1] + 1) bumps++
  if (bumps > 0) { etaFail++; console.error(`  ❌ ETA tăng ${bumps} lần ở nửa sau render`) }
  else console.log('    PASS  ETA nửa sau render chỉ giảm dần, không nhảy ngược')
  if (etaFail) { process.exitCode = 1; console.error(`  ❌ ${etaFail} lỗi ETA`) }

  // ── 5d. Hồi quy: formatElapsed (thời gian thực) khác formatDuration (thời lượng video) ──
  console.log('\n[5d] formatElapsed — thời gian thực vs thời lượng video:')
  const elCases = [[591, '9m 51s'], [125, '2m 05s'], [120, '2m'], [45, '45s'], [0, '0s'], [3725, '1h 02m']]
  let elFail = 0
  for (const [secs, want] of elCases) {
    const got = engine.formatElapsed(secs)
    const ok = got === want
    console.log(`    ${ok ? 'PASS' : 'FAIL'}  ${secs}s → "${got}" (cần "${want}")`)
    if (!ok) elFail++
  }
  if (elFail) { process.exitCode = 1; console.error(`  ❌ ${elFail} ca formatElapsed sai`) }
  // Không được nhầm: formatDuration(238) = "00:03:58" là THỜI LƯỢNG VIDEO, không phải thời gian chờ.
  console.log(`    (tham chiếu) formatDuration(238.4)="${engine.formatDuration(238.4)}" = thời lượng video, formatElapsed(591)="${engine.formatElapsed(591)}" = thời gian chờ thực`)

  // ── 5e. Hồi quy: nhận diện thư mục sync đám mây ──
  console.log('\n[5e] detectCloudSync:')
  const cloudCases = [
    ['E:\\OneDrive\\Aegisub\\out.mp4', 'onedrive'],
    ['C:\\Users\\me\\Dropbox\\out.mp4', 'dropbox'],
    ['/home/me/Google Drive/out.mp4', 'google drive'],
    ['C:\\Temp\\out.mp4', ''],
    ['', ''],
  ]
  let cloudFail = 0
  for (const [p, want] of cloudCases) {
    const got = engine.detectCloudSync(p)
    const ok = got === want
    console.log(`    ${ok ? 'PASS' : 'FAIL'}  "${p || '(rỗng)'}" → "${got}" (cần "${want}")`)
    if (!ok) cloudFail++
  }
  if (cloudFail) { process.exitCode = 1; console.error(`  ❌ ${cloudFail} ca detectCloudSync sai`) }

  console.log('\n══════════ KẾT THÚC E2E — ' + (process.exitCode ? 'THẤT BẠI' : 'TẤT CẢ PASS') + ' ══════════')
  console.log('Thư mục test tạm:', dir)
}

main().catch((e) => {
  console.error('\n❌ E2E lỗi:', e)
  process.exit(1)
})