/**
 * checkBin.js — Kiểm tra các file portable cần thiết trong thư mục bin/
 *
 * Các file bắt buộc:
 *   - ffmpeg.exe, ffprobe.exe   : bản portable Windows (khuyên dùng gyan.dev full build)
 *   - VSFilterMod.dll           : https://github.com/pinterf/VSFilterMod/releases
 *   - VSFilter.dll              : https://github.com/cyberbeing/xy-VSFilter/releases
 *
 * Exit code: 0 nếu đủ, 1 nếu thiếu ít nhất 1 file.
 */
'use strict'

const fs = require('fs')
const path = require('path')

const REQUIRED = [
  { name: 'ffmpeg.exe', hint: 'Tải bản portable tại https://www.gyan.dev/ffmpeg/builds/ (bản full-build)' },
  { name: 'ffprobe.exe', hint: 'Đi kèm trong gói FFmpeg portable bên trên' },
  { name: 'AviSynth.dll', hint: 'Tải bản filesonly tại https://github.com/AviSynth/AviSynthPlus/releases (thư mục x64) — đặt cạnh ffmpeg.exe để chạy portable' },
  { name: 'VSFilterMod.dll', hint: 'Tải tại https://github.com/pinterf/VSFilterMod/releases' },
  { name: 'VSFilter.dll', hint: 'Tải tại https://github.com/cyberbeing/xy-VSFilter/releases (xy-VSFilter)' },
  { name: 'avsplugins/DirectShowSource.dll', hint: 'Plugin source của AviSynth+ (đi kèm bản filesonly) — nạp khi textsub qua AviSynth' },
]

const binDir = path.join(__dirname, '..', 'bin')

console.log('='.repeat(64))
console.log('  KIỂM TRA THƯ MỤC BIN/ — Kull Vietsub Renderer')
console.log('='.repeat(64))
console.log(`Thư mục: ${binDir}\n`)

let missing = 0
for (const item of REQUIRED) {
  const p = path.join(binDir, item.name)
  let status = ''
  let extra = ''
  try {
    const stat = fs.statSync(p)
    if (stat.isFile()) {
      const mb = (stat.size / 1024 / 1024).toFixed(1)
      status = `✅  CÓ  (${mb} MB)`
    } else {
      status = '❌  KHÔNG PHẢI FILE'
      extra = `  → ${item.hint}`
      missing++
    }
  } catch {
    status = '❌  THIẾU'
    extra = `  → ${item.hint}`
    missing++
  }
  console.log(`  ${item.name.padEnd(18)} ${status}${extra}`)
}

console.log('\n' + '-'.repeat(64))
if (missing === 0) {
  console.log('✅ Tất cả file portable cần thiết đã sẵn sàng.')
  process.exit(0)
} else {
  console.log(`❌ Thiếu ${missing} file. Vui lòng tải và đặt vào thư mục bin/ theo gợi ý bên trên.`)
  process.exit(1)
}
