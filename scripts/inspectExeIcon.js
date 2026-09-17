// inspectExeIcon.js — doc RT_GROUP_ICON trong exe, so sanh voi icon kimishinu.
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

function parseIco(file) {
  const b = fs.readFileSync(file)
  const n = b.readUInt16LE(4)
  const out = []
  for (let i = 0; i < n; i++) {
    const o = 6 + i * 16
    out.push({
      w: b[o] || 256,
      h: b[o + 1] || 256,
      bytes: b.readUInt32LE(o + 8),
      off: b.readUInt32LE(o + 12),
    })
  }
  return { n, entries: out, buf: b }
}

function sha(buf) {
  return require('crypto').createHash('sha256').update(buf).digest('hex').slice(0, 16)
}

// 1. Dump RT_GROUP_ICON + RT_ICON từ exe bằng PowerShell (Get-Resource hoặc 7z l)
const target = process.argv[2] || 'release/win-unpacked/Kull Aegisub Renderer.exe'
const abs = path.resolve(target)

// Dùng 7z list resource? Đơn giản: đọc section .rsrc tìm PNG signature (icon PNG-compressed có IHDR)
const exe = fs.readFileSync(abs)
const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
let found = 0
let idx = 0
while ((idx = exe.indexOf(pngSig, idx)) !== -1) {
  found++
  idx += 8
}
console.log(`exe: ${path.basename(abs)} (${(exe.length / 1048576).toFixed(1)} MB)`)
console.log(`so PNG nhung trong exe: ${found}`)

// 2. Icon kimishinu multi-size: sha từng entry
const ico = parseIco(path.join(__dirname, '..', 'build', 'icon.ico'))
console.log(`build/icon.ico: ${ico.n} sizes`)
ico.entries.forEach((e) => {
  const data = ico.buf.subarray(e.off, e.off + e.bytes)
  console.log(`  ${e.w}x${e.h} ${e.bytes}B sha=${sha(data)}`)
})

// 3. Kiểm tra từng entry PNG của icon có mặt trong exe không
let match = 0
ico.entries.forEach((e) => {
  const data = ico.buf.subarray(e.off, e.off + e.bytes)
  if (exe.indexOf(data) !== -1) match++
})
console.log(`entry icon tim thay trong exe: ${match}/${ico.n}`)
if (match === ico.n) console.log('✅ ICON KIMISHINU DA NHUNG DAY DU TRONG EXE')
else console.log('❌ icon trong exe KHONG khop kimishinu')
