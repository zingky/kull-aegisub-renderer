/**
 * test-vsfm-effects.js — Chứng minh HIỆU ỨNG riêng của VSFilterMod thật sự được render
 *
 * Tag `\distort(x1,y1,x2,y2,x3,y3)` chỉ tồn tại trong VSFilterMod (bọc trong
 * `#ifdef _VSMOD` của src/subtitles/RTS.cpp) — libass và xy-VSFilter đều KHÔNG hiểu.
 *
 * Cách kiểm chứng:
 *  1. ASS "plain" và ASS "distort" (cùng chữ, cùng thời điểm, khác đúng 1 tag effect)
 *  2. Lấy 1 frame (t=2s) của mỗi ASS qua VSFilterMod.dll + AviSynth  → YAVG diff PHẢI lớn
 *     ⇒ VSFilterMod thật sự chạy tag effect (nếu app lặng lẽ rơi về VSFilter/libass thì
 *       tag bị bỏ qua ⇒ 2 frame gần như giống nhau, diff ≈ 0)
 *  3. Đối chứng bằng libass (subtitles filter): diff ≈ 0 ⇒ tag đúng là riêng VSFilterMod
 *     ⇒ phép so sánh ở bước 2 là có ý nghĩa.
 */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const engine = require('../electron/ffmpegEngine')
const { ffmpegPath, resolveBin } = require('../electron/paths')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kull-vsfm-'))
process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }) } catch (e) {} })

const video = path.join(dir, 'v.mp4')
const avsFile = [] // dọn .avs ở cuối
const fwd = (p) => p.replace(/\\/g, '/')
const T = 2

function assFile(name, text) {
  const p = path.join(dir, `${name}.ass`)
  fs.writeFileSync(p, [
    '[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 640', 'PlayResY: 480', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,Arial,40,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,3,1,5,10,10,10,1', '',
    '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    `Dialogue: 0,0:00:00.50,0:00:03.90,Default,,0,0,0,,${text}`,
  ].join('\r\n'), 'utf8')
  return p
}

/** YAVG chênh lệch giữa 2 file ảnh (blend difference + signalstats) */
function diffYavg(a, b) {
  const d = spawnSync(ffmpegPath, ['-y', '-v', 'info', '-i', a, '-i', b, '-filter_complex',
    'blend=all_mode=difference,signalstats,metadata=print:file=-', '-f', 'null', '-'], { encoding: 'utf8' })
  const v = (((d.stdout || '') + (d.stderr || '')).match(/YAVG=([\d.]+)/) || [])[1]
  return v == null ? null : parseFloat(v)
}

/** Lấy 1 frame qua AviSynth + VSFilterMod.dll (giống đường đi thật của app & preview) */
function grabAvs(subPath, outPng) {
  const dll = resolveBin('VSFilterMod.dll')
  const avs = engine.createAvsScript(video, subPath, dll, { fps: 24 })
  avsFile.push(avs)
  const r = spawnSync(ffmpegPath, ['-y', '-v', 'error', '-ss', String(T), '-i', avs, '-frames:v', '1', outPng], { encoding: 'utf8' })
  return r.status === 0 && fs.existsSync(outPng)
}

/** Lấy 1 frame qua libass (đối chứng) — cần bù setpts vì -ss dịch timestamp về 0 */
function grabLibass(subPath, outPng) {
  const r = spawnSync(ffmpegPath, ['-y', '-v', 'error', '-ss', String(T), '-i', video,
    '-frames:v', '1', '-vf', `setpts=PTS+${T}/TB,subtitles='${engine.escapeFilterPath(subPath)}'`, outPng], { encoding: 'utf8' })
  return r.status === 0 && fs.existsSync(outPng)
}

let failed = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed++ }

;(() => {
  console.log('=== CHUẨN BỊ ===')
  spawnSync(ffmpegPath, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x480:rate=24:duration=4', '-c:v', 'libx264', '-preset', 'veryfast', video], { encoding: 'utf8' })
  const plain = assFile('plain', 'KARAOKE EFFECT TEST')
  const distort = assFile('distort', '{\\distort(0,0,120,260,340,30)}KARAOKE EFFECT TEST')
  console.log('  video + 2 ASS (plain / có \\distort) đã tạo')

  console.log('\n=== TEST 1: VSFilterMod.dll (AviSynth) ===')
  const pA = path.join(dir, 'mod_plain.png')
  const pD = path.join(dir, 'mod_distort.png')
  ok(grabAvs(plain, pA), 'lấy được frame plain qua VSFilterMod.dll')
  ok(grabAvs(distort, pD), 'lấy được frame có \\distort qua VSFilterMod.dll')
  const d1 = diffYavg(pA, pD)
  console.log(`  YAVG diff (plain vs \\distort) = ${d1}`)
  ok(d1 != null && d1 > 1.5, 'tag \\distort CÓ TÁC DỤNG ⇒ hiệu ứng VSFilterMod thật sự render')

  console.log('\n=== TEST 2: đối chứng libass ===')
  const lA = path.join(dir, 'lib_plain.png')
  const lD = path.join(dir, 'lib_distort.png')
  ok(grabLibass(plain, lA), 'lấy được frame plain qua libass')
  ok(grabLibass(distort, lD), 'lấy được frame có \\distort qua libass')
  const d2 = diffYavg(lA, lD)
  console.log(`  YAVG diff (plain vs \\distort) = ${d2} (≈0 nghĩa là libass bỏ qua tag)`)
  ok(d2 != null && d2 < 0.5, 'libass KHÔNG hiểu \\distort ⇒ tag đúng là riêng VSFilterMod')

  console.log('\n=== TEST 3: khác biệt engine là thật (VSFilterMod ≠ libass) ===')
  const d3 = diffYavg(pA, lA)
  console.log(`  YAVG diff (plain: VSFilterMod vs libass) = ${d3}`)
  ok(d3 != null && d3 > 1.5, 'hai engine render KHÁC nhau ⇒ không bị fallback âm thầm')

  avsFile.forEach((f) => { try { fs.unlinkSync(f) } catch (e) {} })
  console.log(failed ? `\n══════ ${failed} MỤC KHÔNG ĐẠT ══════` : '\n══════ ALL VSFilterMod EFFECT TESTS PASSED ══════')
  process.exit(failed ? 1 : 0)
})()