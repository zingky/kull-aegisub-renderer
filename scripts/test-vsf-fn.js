// test-vsf-fn.js — thử các tên function AviSynth mà VSFilterMod.dll có thể đăng ký
// Dùng: node scripts/test-vsf-fn.js [đường dẫn DLL thay thế]
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const { ffmpegPath, BIN_DIR } = require('../electron/paths')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kull-vsf-'))
process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }) } catch (e) {} })
const video = path.join(dir, 'v.mp4')
const sub = path.join(dir, 's.ass')
spawnSync(ffmpegPath, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x480:rate=24:duration=3', '-c:v', 'libx264', '-preset', 'veryfast', video], { encoding: 'utf8' })
fs.writeFileSync(sub, [
  '[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 320', 'PlayResY: 180', '',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  'Style: Default,Arial,40,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,3,1,2,10,10,20,1', '',
  '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  'Dialogue: 0,0:00:00.10,0:00:02.50,Default,,0,0,0,,MOD TEST (styles đầy đủ)',
].join('\r\n'), 'utf8')

const fwd = (p) => p.replace(/\\/g, '/')
const dll = process.argv[2] || path.join(BIN_DIR, 'VSFilterMod.dll')
const dss = path.join(BIN_DIR, 'avsplugins', 'DirectShowSource.dll')
console.log('DLL test:', dll)

// Thử từng cú pháp (VSFilterMod build _VSMOD đăng ký TextSubMod chứ không phải TextSub)
const variants = [
  ['TextSub(sub)', `TextSub("${fwd(sub)}")`],
  ['TextSubMod(sub)', `TextSubMod("${fwd(sub)}")`],
  ['VSFilterMod(sub)', `VSFilterMod("${fwd(sub)}")`],
]

for (const [label, subLine] of variants) {
  const avs = path.join(dir, label.replace(/[^\w]/g, '_') + '.avs')
  const out = path.join(dir, label.replace(/[^\w]/g, '_') + '.png')
  fs.writeFileSync(avs, [
    'SetFilterMTMode("DEFAULT_MT_MODE", 2)',
    `LoadPlugin("${fwd(dll)}")`,
    `LoadPlugin("${fwd(dss)}")`,
    `DirectShowSource("${fwd(video)}", fps=25, convertfps=true)`,
    subLine,
  ].join('\r\n'))
  const r = spawnSync(ffmpegPath, ['-y', '-v', 'error', '-i', avs, '-frames:v', '1', out], { encoding: 'utf8', timeout: 60000 })
  const err = (r.stderr || '').split('\n').filter((l) => /Script error|no function|Error opening/i.test(l))[0] || '(ok)'
  console.log(label.padEnd(18), 'exit=' + r.status, fs.existsSync(out) ? `FRAME ${Math.round(fs.statSync(out).size / 1024)}KB` : '(no frame)', '|', err.slice(0, 110))
}