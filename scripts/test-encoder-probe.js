// test-encoder-probe.js — hồi quy cho detectEncoders() dùng PROBE ENCODE THẬT
//   Bug cũ: `ffmpeg -encoders` chỉ liệt kê encoder ĐÃ BUILD, không kiểm tra GPU/driver.
//   ⇒ h264_amf luôn hiện (thiếu amfrt64.dll), h264_qsv hiện dù thiếu iGPU/driver Intel
//   ⇒ app báo "AMF khả dụng", người dùng chọn xong render chết ngay.
//   Sửa: encode thật 1 frame 256x256, exit 0 mới tính là dùng được.
//   • 256x256 là bắt buộc — 64x64/128x128 bị NVENC/AMF/QSV từ chối (fail giả).
//   • AMF/QSV hỏng phải rơi về CPU, không được chết render.
'use strict'
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const engine = require('../electron/ffmpegEngine')
const { ffmpegPath } = require('../electron/paths')

let failed = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed++ }

const PROBE_ARGS = (enc, size) => [
  '-hide_banner', '-nostdin', '-loglevel', 'error',
  '-f', 'lavfi', '-i', `color=c=black:s=${size}:r=1:d=1`,
  '-frames:v', '1', '-c:v', enc, '-f', 'null', '-',
]

// ── 1. Mốc kích thước probe: 256x256 là BẮT BUỘC ──
console.log('\n[1] Kích thước probe (chống hồi quy về 64x64 → fail giả)')
const src = fs.readFileSync(path.join(__dirname, '..', 'electron', 'ffmpegEngine.js'), 'utf8')
const m = src.match(/PROBE_SIZE\s*=\s*'(\d+)x(\d+)'/)
ok(!!m, 'PROBE_SIZE được khai báo trong ffmpegEngine.js')
const [pw, ph] = m ? [Number(m[1]), Number(m[2])] : [0, 0]
ok(pw >= 256 && ph >= 256, `PROBE_SIZE = ${pw}x${ph} (>= 256x256)`)

console.log('\n[2] Encode thật ở từng kích thước (xác nhận 64x128/128x128 fail GIẢ)')
for (const size of ['64x64', '128x128', '256x256']) {
  const r = spawnSync(ffmpegPath, PROBE_ARGS('h264_nvenc', size), { encoding: 'utf8', timeout: 20000 })
  console.log(`     nvenc ${size.padEnd(8)} → exit ${r.status}`)
  if (size === '256x256') ok(r.status === 0, '256x256 encode được với NVENC')
}

// ── 3. detectEncoders() phải loại được AMF giả ──
async function main() {
console.log('\n[3] detectEncoders() — probe thật, loại backend hỏng')
const t0 = Date.now()
const avail = await engine.detectEncoders()
const ms = Date.now() - t0
console.log(`     = ${JSON.stringify(avail)} (${ms}ms)`)
ok(Array.isArray(avail), 'trả về mảng')
ok(avail.includes('cpu'), 'luôn có cpu (fallback luôn tồn tại)')
ok(avail.indexOf('cpu') === avail.length - 1, 'cpu đứng cuối (auto ưu tiên GPU trước)')
ok(avail.every((h) => ['nvenc', 'qsv', 'amf', 'cpu'].includes(h)), 'không có backend lạ')
ok(ms < 10000, `probe xong nhanh (${ms}ms < 10s) — không treo UI khởi động`)

// Khớp với probe tay: mỗi backend trong danh sách phải encode được thật,
// và backend vắng mặt phải encode KHÔNG được (nếu được ⇒ đã bỏ sót backend).
console.log('\n[4] Khớp danh sách với encode tay từng backend')
for (const [hw, enc] of [['nvenc', 'h264_nvenc'], ['qsv', 'h264_qsv'], ['amf', 'h264_amf']]) {
  const r = spawnSync(ffmpegPath, PROBE_ARGS(enc, '256x256'), { encoding: 'utf8', timeout: 20000 })
  const real = r.status === 0
  const listed = avail.includes(hw)
  ok(real === listed, `${hw}: encode tay=${real ? 'OK' : 'FAIL'} ↔ detect=${listed ? 'có' : 'không'}`)
}

// ── 5. Backend hỏng phải fallback CPU, không chết render ──
console.log('\n[5] pickEncoder() fallback khi chọn backend không khả dụng')
const pick = (hw) => engine.pickEncoder ? engine.pickEncoder(hw, 'h264', avail, (k) => k)
                               : null
ok(typeof engine.pickEncoder === 'function', 'pickEncoder được export để test')
if (typeof engine.pickEncoder === 'function') {
  // Chọn AMF/QSV trên máy KHÔNG có backend đó → phải tự rơi về CPU.
  for (const hw of ['qsv', 'amf']) {
    if (avail.includes(hw)) continue
    const r = engine.pickEncoder(hw, 'h264', avail, (k) => k)
    ok(r.encoder === 'libx264' && r.hardware === 'cpu' && r.fallback === true,
      `chọn ${hw} khi máy không có → CPU (libx264), nhận ${r.encoder}/${r.hardware}`)
  }
  // auto phải chọn GPU trước CPU
  const a = engine.pickEncoder('auto', 'h264', avail, (k) => k)
  ok(avail.length > 1 ? a.hardware !== 'cpu' : a.hardware === 'cpu',
    `auto → ${a.hardware} (có GPU thì ưu tiên GPU)`)
  // hevc map đúng
  const hv = engine.pickEncoder('auto', 'hevc', avail, (k) => k)
  ok(/hevc_(nvenc|qsv|amf)|libx265/.test(hv.encoder), `auto hevc → ${hv.encoder}`)
}

console.log(failed ? `\n❌ ${failed} lỗi` : '\n✅ Tất cả PASS')
process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error('LỖI:', e); process.exit(1) })
