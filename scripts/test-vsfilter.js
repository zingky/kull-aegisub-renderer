/**
 * test-vsfilter.js — Kiểm tra Engine VSFilter với AviSynth+ bundled (portable)
 *
 *  1. buildRenderCommand('vsfiltermod') → preflight đúng DLL + đúng TÊN HÀM
 *     (VSFilterMod.dll → TextSubMod; VSFilter.dll → TextSub), KHÔNG còn tự đổi DLL
 *  2. Render THẬT engine 'vsfiltermod' → output hợp lệ VÀ có chữ phụ đề trong frame
 *  3. Render THẬT engine 'vsfilter'  → output hợp lệ VÀ có chữ phụ đề trong frame
 *
 * Kiểm chứng "có chữ": so frame giữa clip output với frame gốc (không phụ đề) bằng
 * blend=difference + signalstats → YAVG > 5 nghĩa là chữ đã được vẽ (bằng chứng cho lỗi
 * "VSFilterMod không ra hiệu ứng" — trước đây app lặng lẽ rơi về libass).
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
// ASS có ĐẦY ĐỦ [V4+ Styles] — thiếu style "Default" thì VSFilter không vẽ gì
fs.writeFileSync(sub, [
  '[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 640', 'PlayResY: 480', 'ScaledBorderAndShadow: yes', '',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  'Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,3,1,2,10,10,30,1', '',
  '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  'Dialogue: 0,0:00:00.10,0:00:03.80,Default,,0,0,0,,VSFilter + AviSynth OK',
].join('\r\n'), 'utf8')

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

/** YAVG chênh lệch giữa frame của output (giây t) và frame gốc cùng thời điểm → có chữ hay không */
function textDiff(file, t) {
  const a = path.join(dir, `f_${path.basename(file, '.mp4')}_${t}.png`)
  const b = path.join(dir, `clean_${t}.png`)
  spawnSync(ffmpegPath, ['-y', '-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', a], { encoding: 'utf8' })
  spawnSync(ffmpegPath, ['-y', '-v', 'error', '-ss', String(t), '-i', video, '-frames:v', '1', b], { encoding: 'utf8' })
  if (!fs.existsSync(a) || !fs.existsSync(b)) return null
  const d = spawnSync(ffmpegPath, ['-y', '-v', 'info', '-i', a, '-i', b, '-filter_complex',
    'blend=all_mode=difference,signalstats,metadata=print:file=-', '-f', 'null', '-'], { encoding: 'utf8' })
  const v = (((d.stdout || '') + (d.stderr || '')).match(/YAVG=([\d.]+)/) || [])[1]
  return v == null ? null : parseFloat(v)
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
  console.log('  fn (AviSynth):', plan.subPlan.fn)
  console.log('  note         :', plan.subPlan.note || '(không)')
  console.log('  avsPath      :', plan.subPlan.avsPath)
  if (plan.subPlan.type !== 'avs') { console.error('  ❌ Không đạt plan avs!'); process.exit(1) }
  if (plan.subPlan.dllName !== 'VSFilterMod.dll' || plan.subPlan.fn !== 'TextSubMod') {
    console.error(`  ❌ Phải là VSFilterMod.dll + TextSubMod, nhận ${plan.subPlan.dllName} + ${plan.subPlan.fn}`)
    process.exit(1)
  }
  console.log('  ✅ PASS — VSFilterMod.dll qua TextSubMod (không còn rơi về VSFilter.dll/libass)')

  console.log('\n=== TEST 2: RENDER THẬT engine=vsfiltermod ===')
  const t1 = await render('vsfiltermod', out1)
  console.log(t1.logs.map((l) => '  ' + l).join('\n'))
  if (t1.ok && fs.existsSync(out1)) {
    const m = await engine.probeMedia(out1)
    console.log(`  ✅ output ${m.width}x${m.height}@${m.fps}fps audio=${m.hasAudio ? 'có' : 'không'} (${(fs.statSync(out1).size / 1024).toFixed(0)} KB)`)
    // t=0: cue chưa bắt đầu (0.1s) → YAVG này là NHIỄU re-encode (baseline)
    const base = textDiff(out1, 0)
    const y = textDiff(out1, 2)
    console.log(`  YAVG frame@2s (VSFilterMod) vs frame gốc = ${y} (baseline re-encode @0s = ${base})`)
    if (!(y - base > 2)) { console.error('  ❌ KHÔNG thấy chữ phụ đề trong output!'); process.exit(1) }
    console.log('  ✅ CÓ CHỮ PHỤ ĐỀ trong output (cao hơn baseline rõ rệt)')
  } else { console.error('  ❌ FAIL'); process.exit(1) }

  console.log('\n=== TEST 3: RENDER THẬT engine=vsfilter ===')
  const t2 = await render('vsfilter', out2)
  console.log(t2.logs.map((l) => '  ' + l).join('\n'))
  if (t2.ok && fs.existsSync(out2)) {
    const m = await engine.probeMedia(out2)
    console.log(`  ✅ output ${m.width}x${m.height}@${m.fps}fps audio=${m.hasAudio ? 'có' : 'không'} (${(fs.statSync(out2).size / 1024).toFixed(0)} KB)`)
    const base = textDiff(out2, 0)
    const y = textDiff(out2, 2)
    console.log(`  YAVG frame@2s (VSFilter) vs frame gốc = ${y} (baseline re-encode @0s = ${base})`)
    if (!(y - base > 2)) { console.error('  ❌ KHÔNG thấy chữ phụ đề trong output!'); process.exit(1) }
    console.log('  ✅ CÓ CHỮ PHỤ ĐỀ trong output (cao hơn baseline rõ rệt)')
  } else { console.error('  ❌ FAIL'); process.exit(1) }

  console.log('\n══════ ALL VSFilter/AviSynth TESTS PASSED ══════')
  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })