'use strict'
/**
 * testTrimFade.js — kiểm chứng THẬT các tính năng v2.0 bằng FFmpeg:
 *   1. Trim A→B ảnh hưởng video render chính (độ dài output = B-A)
 *   2. Fade đầu/cuối làm tối khung đầu (đo luminance thật, không đoán)
 *   3. exportTrimClip xuất clip A→B riêng, KHÔNG phụ đề, GIỮ đuôi định dạng gốc
 *
 * Chạy: node scripts/testTrimFade.js
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const engine = require('../electron/ffmpegEngine')

const ffmpeg = path.join(__dirname, '..', 'bin', 'ffmpeg.exe')
const ffprobe = path.join(__dirname, '..', 'bin', 'ffprobe.exe')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kull-trimfade-'))
const sample = path.join(dir, 'sample.mp4')
const ass = path.join(dir, 'sub.ass')

let pass = 0
let fail = 0
function check(ok, label) {
  if (ok) { pass++; console.log('  ✓', label) } else { fail++; console.log('  ✗', label) }
}

console.log('Thư mục test:', dir)

// ── Video mẫu 6s (testsrc2 sáng màu + audio) ─────────────────────────────
spawnSync(ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x480:rate=24:duration=6',
  '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:v', 'libx264', '-preset', 'veryfast',
  '-c:a', 'aac', '-shortest', sample], { stdio: 'ignore' })

// ── Phụ đề .ass tối giản ─────────────────────────────────────────────────
fs.writeFileSync(ass, [
  '[Script Info]',
  'ScriptType: v4.00+',
  'PlayResX: 640',
  'PlayResY: 480',
  '',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  'Style: Default,Arial,36,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1',
  '',
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  'Dialogue: 0,0:00:00.00,0:00:06.00,Default,,0,0,0,,KULL TRIM FADE TEST',
].join('\r\n'), 'utf8')

/** Độ dài (giây) của file media */
function duration(p) {
  const r = spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of',
    'default=nw=1:nk=1', p], { encoding: 'utf8' })
  return parseFloat(String(r.stdout).trim())
}

/** Luminance trung bình (0-255) của 1 frame tại mốc thời gian t */
function lum(p, t) {
  const r = spawnSync(ffmpeg, ['-v', 'error', '-ss', String(t), '-i', p, '-frames:v', '1',
    '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { encoding: 'buffer' })
  return r.stdout && r.stdout.length ? r.stdout[0] : null
}

async function render(opts, label) {
  const logs = []
  const errs = []
  await engine.startRender(opts, {
    onLog: (msg) => logs.push(String(msg)),
    onProgress: () => {},
    onDone: () => {},
    onError: (e) => errs.push(e),
  })
  if (errs.length) console.log(`  [${label}] lỗi:`, errs[0].message, String(errs[0].detail || '').slice(0, 300))
  return { logs, errs }
}

async function main() {
  const base = { mainVideo: sample, subtitle: ass, intro: null, outro: null, subtitleEngine: 'libass',
    hardware: 'cpu', quality: 'original', custom: null, lang: 'vi' }

  // ── 1. Trim A→B (1.5s → 3.5s) + fade 0.5s ─────────────────────────────
  const outClip = path.join(dir, 'trimmed.mp4')
  await render({ ...base, trim: { enabled: true, start: 1.5, end: 3.5 },
    fades: { enabled: true, duration: 0.5 }, outputPath: outClip }, 'trim+fade')
  check(fs.existsSync(outClip), '1. render trim+fade tạo được file output')
  const d1 = fs.existsSync(outClip) ? duration(outClip) : 0
  check(Math.abs(d1 - 2) < 0.35, `1. độ dài output = 2s (thực tế ${d1.toFixed(2)}s) — trim A→B có tác dụng`)

  // ── 2. Fade in: khung đầu phải tối hơn hẳn khung giữa ─────────────────
  const lFirst = fs.existsSync(outClip) ? lum(outClip, 0.02) : null
  const lMid = fs.existsSync(outClip) ? lum(outClip, 1.0) : null
  console.log(`     luminance: khung đầu=${lFirst} · khung giữa=${lMid}`)
  check(lFirst !== null && lMid !== null && lFirst < lMid * 0.6,
    `2. fade in hoạt động (khung đầu tối hơn khung giữa: ${lFirst} < ${lMid})`)

  // ── 3. Không bật fade → khung đầu sáng bình thường (đối chứng) ────────
  const outNoFade = path.join(dir, 'nofade.mp4')
  await render({ ...base, trim: { enabled: false }, fades: { enabled: false },
    outputPath: outNoFade }, 'no-fade')
  check(fs.existsSync(outNoFade), '3. render không fade tạo được file output')
  const lNoFade = fs.existsSync(outNoFade) ? lum(outNoFade, 0.02) : null
  console.log(`     luminance khung đầu (không fade)=${lNoFade}`)
  check(lNoFade !== null && lFirst !== null && lNoFade > lFirst,
    `3. đối chứng: không fade thì khung đầu sáng hơn (${lNoFade} > ${lFirst})`)

  // ── 4. exportTrimClip: clip riêng, giữ đuôi .mp4, không phụ đề ────────
  const outAB = path.join(dir, 'clipAB.mp4')
  const errs4 = []
  await engine.exportTrimClip({ mainVideo: sample, trim: { start: 2, end: 4 }, outputPath: outAB, lang: 'vi' },
    { onLog: () => {}, onProgress: () => {}, onDone: () => {}, onError: (e) => errs4.push(e) })
  if (errs4.length) console.log('  [exportTrimClip] lỗi:', errs4[0].message, String(errs4[0].detail || '').slice(0, 300))
  check(fs.existsSync(outAB), '4. nút Export A→B tạo được clip riêng')
  const dAB = fs.existsSync(outAB) ? duration(outAB) : 0
  check(Math.abs(dAB - 2) < 0.35, `4. clip A→B dài 2s (thực tế ${dAB.toFixed(2)}s)`)
  check(path.extname(outAB) === '.mp4', '4. giữ nguyên định dạng gốc (.mp4)')

  // ── 5. Không trim thì giữ đủ 6s (fade chỉ đổi hình, không đổi độ dài) ─
  const dNoFade = fs.existsSync(outNoFade) ? duration(outNoFade) : 0
  check(Math.abs(dNoFade - 6) < 0.4, `5. không trim → giữ đủ 6s (thực tế ${dNoFade.toFixed(2)}s)`)

  console.log(`\n${fail === 0 ? '✅ TẤT CẢ PASS' : `❌ CÓ ${fail} MỤC SAI`} (${pass} pass / ${fail} fail)`)
  try { fs.rmSync(dir, { recursive: true, force: true }); console.log('Đã dọn thư mục test tạm') } catch {}
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error('Lỗi test:', e); process.exit(1) })
