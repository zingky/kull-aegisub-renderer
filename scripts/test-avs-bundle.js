// test-avs-bundle.js — Kiểm tra AviSynth.dll portable (bundled trong bin/) có hoạt động qua FFmpeg không
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const { ffmpegPath, BIN_DIR } = require('../electron/paths')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kull-avs-'))
const video = path.join(dir, 'v.mp4')
const sub = path.join(dir, 's.ass')
const avs = path.join(dir, 'test.avs')
const out = path.join(dir, 'frame.png')

// 1. Tạo video mẫu (h264+aac)
let r = spawnSync(ffmpegPath, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x480:rate=24:duration=5',
  '-c:v', 'libx264', '-preset', 'veryfast', video], { encoding: 'utf8' })
console.log('Tạo video:', r.status === 0 ? 'OK' : 'FAIL', r.stderr.slice(0, 200))

fs.writeFileSync(sub, '[Script Info]\nPlayResX: 640\nPlayResY: 360\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.20,0:00:02.80,Default,,0,0,0,,{\\b1}AVI SYNTH BUNDLE TEST{\\b0}', 'utf8')

// 2. Sinh AviSynth script — LoadPlugin trực tiếp từ thư mục bin/
const dll = (n) => path.join(BIN_DIR, n).replace(/\\/g, '/')
const script = [
  'SetFilterMTMode("DEFAULT_MT_MODE", 2)',
  `LoadPlugin("${dll('VSFilterMod.dll')}")`,
  `LoadPlugin("${dll('avsplugins/DirectShowSource.dll')}")`,
  `DirectShowSource("${video.replace(/\\/g, '/')}", fps=25, convertfps=true)`,
  `TextSub("${sub.replace(/\\/g, '/')}")`,
].join('\r\n')
fs.writeFileSync(avs, script, 'utf8')
console.log('\n✅ AviSynth script:\n' + script)

// 3. FFMpeg đọc .avs → xuất 1 frame
console.log('\nFFmpeg đọc .avs (demuxer avisynth + AviSynth.dll bundled)...')
r = spawnSync(ffmpegPath, ['-y', '-v', 'info', '-i', avs, '-frames:v', '1', out], { encoding: 'utf8', timeout: 60000 })
const stderr = r.stderr || ''
console.log('Exit code:', r.status)
console.log('--- stderr (rút gọn) ---')
console.log(stderr.split('\n').filter(l => /Stream|Input|Output|avisynth|AviSynth|Error|error|DirectShow|codec|Invalid|unable|could not/i.test(l)).slice(0, 25).join('\n'))

if (r.status === 0 && fs.existsSync(out)) {
  const sz = fs.statSync(out).size
  console.log('\n✅ AVISYNTH BUNDLED WORKS — frame xuất OK (' + (sz / 1024).toFixed(1) + ' KB)')
  process.exit(0)
} else {
  console.log('\n❌ AviSynth chưa hoạt động trong môi trường hiện tại')
  process.exit(1)
}