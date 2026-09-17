// inspectExeIcon2.js — parse PE resource tree: .rsrc -> RT_GROUP_ICON -> RT_ICON, tái tạo .ico từng nhóm icon.
'use strict'
const fs = require('fs')
const path = require('path')

const target = path.resolve(process.argv[2] || 'release/win-unpacked/Kull Aegisub Renderer.exe')
const exe = fs.readFileSync(target)
const crypto = require('crypto')
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 12)

// --- PE parse ---
const e_lfanew = exe.readUInt32LE(0x3c)
const numSec = exe.readUInt16LE(e_lfanew + 6)
const optSize = exe.readUInt16LE(e_lfanew + 20)
const secOff = e_lfanew + 24 + optSize
console.log(`PE sections: ${numSec}`)
let rsrc = null
for (let i = 0; i < numSec; i++) {
  const o = secOff + i * 40
  const name = exe.subarray(o, o + 8).toString('ascii').replace(/\0/g, '')
  const vsize = exe.readUInt32LE(o + 8)
  const vaddr = exe.readUInt32LE(o + 12)
  const rawSize = exe.readUInt32LE(o + 16)
  const rawPtr = exe.readUInt32LE(o + 20)
  if (name === '.rsrc') rsrc = { vaddr, rawPtr, rawSize }
  console.log(`  ${name} vaddr=0x${vaddr.toString(16)} raw=0x${rawPtr.toString(16)} size=${rawSize}`)
}
if (!rsrc) { console.log('KHONG TIM THAY .rsrc'); process.exit(1) }
const R = rsrc.rawPtr
const rva2raw = (rva) => R + (rva - rsrc.vaddr)

function readDir(off) {
  const nNamed = exe.readUInt16LE(off + 12)
  const nId = exe.readUInt16LE(off + 14)
  const list = []
  for (let i = 0; i < nNamed + nId; i++) {
    const o = off + 16 + i * 8
    list.push({ id: exe.readUInt32LE(o), dataOff: exe.readUInt32LE(o + 4) })
  }
  return list
}
function leafData(entryOff) {
  const dataRVA = exe.readUInt32LE(entryOff)
  const size = exe.readUInt32LE(entryOff + 4)
  const raw = rva2raw(dataRVA)
  return exe.subarray(raw, raw + size)
}

// type level (offset R)
const types = readDir(R)
console.log(`resource types: ${types.map((t) => t.id).join(', ')}`)
const RT_GROUP_ICON = 14, RT_ICON = 3
const gGroup = types.find((t) => (t.id & 0x7fffffff) === RT_GROUP_ICON)
const gIcon = types.find((t) => (t.id & 0x7fffffff) === RT_ICON)
if (!gGroup) { console.log('KHONG CO RT_GROUP_ICON — exe dung icon mac dinh!'); process.exit(2) }

const groups = readDir(R + (gGroup.dataOff & 0x7fffffff))
// map RT_ICON id -> data (qua name/lang level: id -> lang dir -> leaf)
const icons = new Map()
const iconIds = readDir(R + (gIcon.dataOff & 0x7fffffff))
for (const idEnt of iconIds) {
  const langDir = readDir(R + (idEnt.dataOff & 0x7fffffff))
  const leafOff = R + (langDir[0].dataOff & 0x7fffffff)
  icons.set(idEnt.id & 0x7fffffff, leafData(leafOff))
}
console.log(`RT_ICON entries: ${icons.size}`)

groups.forEach((g, gi) => {
  const langDir = readDir(R + (g.dataOff & 0x7fffffff))
  const grpData = leafData(R + (langDir[0].dataOff & 0x7fffffff))
  const count = grpData.readUInt16LE(4)
  console.log(`GROUP_ICON #${gi} id=${g.id & 0x7fffffff}: ${count} images`)
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 14
    const w = grpData[o] || 256, h = grpData[o + 1] || 256
    const bytes = grpData.readUInt32LE(o + 8)
    const iconId = grpData.readUInt16LE(o + 12)
    const data = icons.get(iconId)
    const isPng = data && data[0] === 0x89 && data[1] === 0x50
    console.log(`  ${w}x${h} ${bytes}B ${isPng ? 'PNG' : 'BMP/DIB'} sha=${data ? sha(data) : '?'}`)
  }
})
