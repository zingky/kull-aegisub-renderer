/**
 * test-vsfilter.js — Kiểm tra Engine VSFilter với AviSynth+ bundled (portable)
 *
 *  1. buildRenderCommand('vsfiltermod') → preflight: VSFilterMod.dll không có TextSub
 *     → tự đổi sang VSFilter.dll (subPlan.type='avs', dllName='VSFilter.dll')
 *  2. Render THẬT bằng engine 'vsfiltermod' → output hợp lệ
 *  3. Render THẬT bằng engine 'vsfilter'  → output hợp lệ
 */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const engine = require('../electron/ffmpegEngine')
const { ffmpegPath } = require('../electron/paths')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kull-vsf-'))
// Tự dọn thư mục test khi process kết thúc (dù pass hay lỗi)
process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }) } catch (e) {} })
const video = path.join(dir, 'v.mp4')
const sub = path.join(dir, 'a.ass')
const out1 = path.join(dir, 'out_mod.mp4')
const out2 = path.join(dir, 'out_vsf.mp4')

let r = spawnSync(ffmpegPath, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x480:rate=24:duration=4',
  '-f', 'lavfi', '-i', 'sine=frequency=330:duration=4', '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', video], { encoding: 'utf8' })
fs.writeFileSync(sub, '[Script Info]\nPlayResX: 640\nPlayResY: 480\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.10,0:00:03.80,Default,,0,0,0,,{\\b1}VSFilter + AviSynth bundled{\\b0} OK', 'utf8')

function render(engineName, outPath) {
  return new Promise((resolve) => {
    const logs = []
    engine.startRender(
      {
        mainVideo: video, subtitle: sub, intro: null, outro: null, mergeEnabled: false,
        subtitleEngine: engineName, hardware: 'cpu', quality: 'original', custom: {},
        outputPath: outPath,
      },
      {
        onLog: (l, lv) => logs.push(`[${lv || 'info'}] ${l}`),
        onProgress: () => {},
        onDone: (d) => resolve({ ok: !d.canceled, canceled: d.canceled, logs, path: outPath }),
        onError: (e) => resolve({ ok: false, logs, error: e }),
      }
    )
  })
}

;(async () => {
  console.log('=== TEST 1: plan với engine=vsfiltermod ===')
  const plan = await engine.buildRenderCommand({
    mainVideo: video, subtitle: sub, intro: null, outro: null, mergeEnabled: false,
    subtitleEngine: 'vsfiltermod', hardware: 'cpu', quality: 'original', custom: {},
    outputPath: out1,
  })
  console.log('  subPlan.type :', plan.subPlan.type)
  console.log('  dllName      :', plan.subPlan.dllName)
  console.log('  note         :', plan.subPlan.note || '(không)')
  console.log('  avsPath      :', plan.subPlan.avsPath)
  if (plan.subPlan.type !== 'avs') { console.error('  ❌ Không đạt plan avs!'); process.exit(1) }
  console.log('  ✅ PASS — tự đổi VSFilterMod.dll → VSFilter.dll (có TextSub)')

  console.log('\n=== TEST 2: RENDER THẬT engine=vsfiltermod ===')
  const t1 = await render('vsfiltermod', out1)
  console.log(t1.logs.map((l) => '  ' + l).join('\n'))
  if (t1.ok && fs.existsSync(out1)) {
    const m = await engine.probeMedia(out1)
    console.log(`  ✅ PASS — output ${m.width}x${m.height}@${m.fps}fps audio=${m.hasAudio ? 'có' : 'không'} (${(fs.statSync(out1).size / 1024).toFixed(0)} KB)`)
  } else { console.error('  ❌ FAIL'); process.exit(1) }

  console.log('\n=== TEST 3: RENDER THẬT engine=vsfilter ===')
  const t2 = await render('vsfilter', out2)
  console.log(t2.logs.map((l) => '  ' + l).join('\n'))
  if (t2.ok && fs.existsSync(out2)) {
    const m = await engine.probeMedia(out2)
    console.log(`  ✅ PASS — output ${m.width}x${m.height}@${m.fps}fps audio=${m.hasAudio ? 'có' : 'không'} (${(fs.statSync(out2).size / 1024).toFixed(0)} KB)`)
  } else { console.error('  ❌ FAIL'); process.exit(1) }

  console.log('\n══════ ALL VSFilter/AviSynth TESTS PASSED ══════')
  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })