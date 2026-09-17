// buildMultiIco.js — ghép các PNG (16..256) thành multi-size .ico (PNG-compressed entries).
'use strict'
const fs = require('fs')
const path = require('path')
const os = require('os')

const sizes = [16, 24, 32, 48, 64, 128, 256]
const entries = sizes.map((s) => {
  const data = fs.readFileSync(path.join(os.tmpdir(), `kull-${s}.png`))
  return { size: s, data }
})

// ICO header: reserved(2)=0, type(2)=1, count(2)
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(entries.length, 4)

// Mỗi ICONDIRENTRY 16 bytes
let offset = 6 + 16 * entries.length
const dir = Buffer.alloc(16 * entries.length)
entries.forEach((e, i) => {
  const o = i * 16
  dir[o] = e.size >= 256 ? 0 : e.size       // width (0 = 256)
  dir[o + 1] = e.size >= 256 ? 0 : e.size   // height (0 = 256)
  dir[o + 2] = 0                            // color count
  dir[o + 3] = 0                            // reserved
  dir.writeUInt16LE(1, o + 4)               // planes
  dir.writeUInt16LE(32, o + 6)              // bit count
  dir.writeUInt32LE(e.data.length, o + 8)   // bytes in res
  dir.writeUInt32LE(offset, o + 12)         // image offset
  offset += e.data.length
})

const out = Buffer.concat([header, dir, ...entries.map((e) => e.data)])
const dest = path.join(__dirname, '..', 'build', 'icon.ico')
fs.copyFileSync(dest, dest + '.single.bak')
fs.writeFileSync(dest, out)
console.log(`OK: ${dest} = ${out.length} bytes, ${entries.length} sizes`)
