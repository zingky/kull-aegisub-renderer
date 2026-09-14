// test-avs-dlls.js — So sánh khả năng TextSub của VSFilter.dll vs VSFilterMod.dll khi load qua AviSynth+
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const { ffmpegPath, BIN_DIR } = require('../electron/paths')

function peMachine(p) {
  const b = fs.readFileSync(p)
  const peOff = b.readUInt32LE(0x3c)
  return b.readUInt16LE(peOff + 4) // 0x8664 = x64, 0x14c = x86
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kull-avs2-'))
const video = path.join(dir, 'v.mp4')
const sub = path.join(dir, 's.ass')
let r = spawnSync(ffmpegPath, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x480:rate=24:duration=3',
  '-c:v', 'libx264', '-preset', 'veryfast', video], { encoding: 'utf8' })
fs.writeFileSync(sub, '[Script Info]\nPlayResX: 320\nPlayResY: 180\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.10,0:00:02.50,Default,,0,0,0,,{\\b1}TextSub TEST{\\b0}', 'utf8')

for (const name of ['VSFilterMod.dll', 'VSFilter.dll']) {
  const p = path.join(BIN_DIR, name)
  if (!fs.existsSync(p)) { console.log(name, '?? thiếu'); continue }
  const arch = peMachine(p) === 0x8664 ? 'x64' : peMachine(p) === 0x14c ? 'x86' : '0x' + peMachine(p).toString(16)
  const avs = path.join(dir, name.replace('.dll', '') + '.avs')
  const outPng = path.join(dir, name.replace('.dll', '') + '.png')
  const script = [
    'SetFilterMTMode("DEFAULT_MT_MODE", 2)',
    `LoadPlugin("${p.replace(/\\/g, '/')}")`,
    `LoadPlugin("${path.join(BIN_DIR, 'avsplugins', 'DirectShowSource.dll').replace(/\\/g, '/')}")`,
    `DirectShowSource("${video.replace(/\\/g, '/')}", fps=25, convertfps=true)`,
    `TextSub("${sub.replace(/\\/g, '/')}")`,
  ].join('\r\n')
  fs.writeFileSync(avs, script, 'utf8')
  r = spawnSync(ffmpegPath, ['-y', '-v', 'info', '-i', avs, '-frames:v', '1', outPng], { encoding: 'utf8', timeout: 60000 })
  const err = (r.stderr || '').split('\n').filter(l => /Script error|LoadPlugin|TextSub|Error opening|Codec to muxer|Stream #|avisynth/i.test(l)).slice(0, 12).join(' | ') || '(không có)' 
  console.log(`\n${name}  [${arch}]  exit=${r.status}\n  → ${err}\n  ${fs.existsSync(outPng) ? '✅ SUBTITLE FRAME = ' + (fs.statSync(outPng).size / 1024).toFixed(1) + ' KB' : '❌ không có frame'} `)
}