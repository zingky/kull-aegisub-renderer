// test-avs-seek.js — kiểm tra ĐƯỜNG ĐI PREVIEW FRAME qua AviSynth (engine.createAvsScript)
//   Video 60s, 2 cue phụ đề: "EARLY CUE HERE" (0.1–1.5s) và "SEEK OK AT 50" (49.5–50.5s)
//   • seek `-ss t` trước `-i script.avs` phải ra ĐÚNG frame tại giây t (không phải frame 0)
//   • t=50 → cờ chữ hiện | t=0.5 → cue sớm hiện | t=0 → chưa có cue nào
//   • Dùng CHÍNH ffmpeg args như electron/main.js (preview-frame) và engine.createAvsScript
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const engine = require('../electron/ffmpegEngine')
const { ffmpegPath, resolveBin } = require('../electron/paths')

let failed = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed++ }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kull-seek-'))
process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }) } catch (e) {} })
const fwd = (p) => p.replace(/\\/g, '/')
const video = path.join(dir, 'v.mp4')
const sub = path.join(dir, 's.ass')

console.log('[1] Tạo video testsrc2 60s...')
let r = spawnSync(ffmpegPath, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x480:rate=24:duration=60', '-c:v', 'libx264', '-preset', 'veryfast', video], { encoding: 'utf8' })
if (r.status !== 0) { console.error('tạo video fail', r.stderr); process.exit(1) }

fs.writeFileSync(sub, [
  '[Script Info]',
  'ScriptType: v4.00+',
  'PlayResX: 640',
  'PlayResY: 480',
  'WrapStyle: 0',
  'ScaledBorderAndShadow: yes',
  '',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  'Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,3,1,2,10,10,30,1',
  '',
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  'Dialogue: 0,0:00:00.10,0:00:01.50,Default,,0,0,0,,EARLY CUE HERE',
  'Dialogue: 0,0:00:49.50,0:00:50.50,Default,,0,0,0,,SEEK OK AT 50',
].join('\r\n'))

// Dùng ĐÚNG hàm app đang dùng cho preview (VSFilterMod.dll → TextSubMod)
const avs = engine.createAvsScript(video, sub, resolveBin('VSFilterMod.dll'), { fps: 24 })
console.log('[1b] .avs do engine.createAvsScript sinh ra:', path.basename(avs))
console.log(fs.readFileSync(avs, 'utf8').trim().split('\r\n').map((l) => '      ' + l).join('\n'))
ok(/TextSubMod\("/.test(fs.readFileSync(avs, 'utf8')), '.avs gọi TextSubMod() cho VSFilterMod.dll')

const testSeek = (t) => {
  const out = path.join(dir, `seek_${t}.png`)
  const t0 = Date.now()
  r = spawnSync(ffmpegPath, ['-y', '-v', 'error', '-ss', String(t), '-i', avs, '-frames:v', '1', '-an', out], { encoding: 'utf8', timeout: 60000 })
  const ms = Date.now() - t0
  console.log(`[2] seek t=${t}: exit=${r.status} ${fs.existsSync(out) ? Math.round(fs.statSync(out).size / 1024) + 'KB' : 'NO FRAME'} trong ${ms}ms`)
  if (r.status !== 0) console.log('   err:', (r.stderr || '').slice(0, 300))
  return out
}

const out50 = testSeek(50)
const out0 = testSeek(0)
const out05 = testSeek(0.5)

/** YAVG chênh lệch giữa 2 ảnh (blend difference + signalstats) */
const cmpY = (a, b) => {
  const d = spawnSync(ffmpegPath, ['-y', '-v', 'info', '-i', a, '-i', b, '-filter_complex', 'blend=all_mode=difference,signalstats,metadata=print:file=-', '-f', 'null', '-'], { encoding: 'utf8' })
  const v = (((d.stdout || '') + (d.stderr || '')).match(/YAVG=([\d.]+)/) || [])[1]
  return v == null ? null : parseFloat(v)
}
/** Frame gốc (KHÔNG phụ đề) tại giây t */
const cleanAt = (t) => {
  const f = path.join(dir, `clean_${t}.png`)
  spawnSync(ffmpegPath, ['-y', '-v', 'error', '-ss', String(t), '-i', video, '-frames:v', '1', f], { encoding: 'utf8' })
  return f
}

console.log('\n[3] Nội dung frame (so với frame gốc cùng giây):')
const c50 = cleanAt(50), c0 = cleanAt(0), c05 = cleanAt(0.5)
const y50 = cmpY(out50, c50)
const y05 = cmpY(out05, c05)
const y0 = cmpY(out0, c0)
ok(y50 > 2, `t=50 có chữ "SEEK OK AT 50" (YAVG=${y50})`)
ok(y05 > 2, `t=0.5 còn cue sớm "EARLY CUE HERE" (YAVG=${y05})`)
ok(y0 === 0, `t=0 chưa có cue nào (YAVG=${y0})`)

console.log('\n[4] Seek ra ĐÚNG frame (không phải frame 0):')
const y05v0 = cmpY(out05, c0)
const y50v0 = cmpY(out50, c0)
ok(y05v0 > 1, `frame seek 0.5 KHÁC frame gốc 0 (YAVG=${y05v0}; ≈0 = seek hỏng)`)
ok(y50v0 > 1, `frame seek 50 KHÁC frame gốc 0 (YAVG=${y50v0}; ≈0 = seek hỏng)`)

console.log('\n[5] Đối chứng libass (cùng cue, cùng giây):')
const ref50 = path.join(dir, 'ref50.png')
spawnSync(ffmpegPath, ['-y', '-v', 'error', '-ss', '50', '-i', video, '-frames:v', '1',
  '-vf', `setpts=PTS+50/TB,subtitles='${engine.escapeFilterPath(sub)}'`, ref50], { encoding: 'utf8' })
const yref = fs.existsSync(ref50) ? cmpY(ref50, c50) : null
ok(yref > 2, `libass cũng thấy chữ ở t=50 (YAVG=${yref})`)
ok(y50 > 0 && yref > 0 && Math.abs(y50 - yref) < 3.5, `Mức "có chữ" của AviSynth/VSFilterMod tương đương libass (chênh ${y50 != null && yref != null ? Math.abs(y50 - yref).toFixed(2) : '?'})`)

try { fs.unlinkSync(avs) } catch (e) {}
console.log(failed ? `\n══════ ${failed} MỤC KHÔNG ĐẠT ══════` : '\n══════ ALL AVS SEEK/PREVIEW TESTS PASSED ══════')
process.exit(failed ? 1 : 0)