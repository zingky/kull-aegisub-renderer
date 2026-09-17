/**
 * e2eTest.js — Kiểm thử End-to-End Core Engine (chạy độc lập, không cần Electron GUI)
 *
 *  1. Tạo video mẫu + subtitle .ass bằng đúng ffmpeg.exe trong bin/
 *  2. Kiểm tra probeMedia (đọc thông số gốc)
 *  3. Kiểm tra lắp ráp câu lệnh (bao gồm ghép Intro/Outro concat)
 *  4. Render thật → kiểm tra file output tồn tại
 *  5. Đơn vị: escapeFilterPath, parseProgressLine, qualityArgs
 */
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const engine = require('../electron/ffmpegEngine')
const { ffmpegPath } = require('../electron/paths')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kull-e2e-'))
const video = path.join(dir, 'sample.mp4')
const outro = path.join(dir, 'outro.mp4')
const sub = path.join(dir, 'sub.ass')
const output = path.join(dir, 'output_merged.mp4')

function run(bin, args) {
  return spawnSync(bin, args, { encoding: 'utf8' })
}

async function main() {
  console.log('══════════ E2E TEST — KULL AEGISUB RENDERER ══════════\n')

  // ── 1. Tạo media mẫu ──
  console.log('[1] Tạo video mẫu...')
  let r = run(ffmpegPath, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x480:rate=24:duration=10',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=10', '-c:v', 'libx264', '-preset', 'veryfast',
    '-c:a', 'aac', '-shortest', video])
  console.log('    video chính status:', r.status)
  r = run(ffmpegPath, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x480:rate=24:duration=3',
    '-f', 'lavfi', '-i', 'sine=frequency=220:duration=3', '-c:v', 'libx264', '-preset', 'veryfast',
    '-c:a', 'aac', '-shortest', outro])
  console.log('    outro status:', r.status)

  fs.writeFileSync(sub, [
    '[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 640', 'PlayResY: 480', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,Arial,28,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,20,20,24,1', '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    'Dialogue: 0,0:00:00.50,0:00:09.50,Default,,0,0,0,,{\\b1}Kull Vietsub E2E{\\b0} Render OK',
  ].join('\r\n'), 'utf8')
  console.log('    subtitle .ass đã tạo')

  // ── 2. Probe ──
  console.log('\n[2] probeMedia(video chính):')
  const meta = await engine.probeMedia(video)
  console.log('   ', JSON.stringify(meta))
  if (meta.width !== 640 || meta.height !== 480) throw new Error('Sai resolution khi probe!')

  // ── 3. Build command ──
  console.log('\n[3] buildRenderCommand (libass + ghép outro):')
  const cmd = await engine.buildRenderCommand({
    mainVideo: video,
    subtitle: sub,
    intro: null,
    outro,
    mergeEnabled: true,
    subtitleEngine: 'libass',
    hardware: 'cpu',
    quality: 'original',
    custom: { resolution: '640x480', fps: '24', bitrate: '600' },
    outputPath: output,
  })
  console.log('    encoder:', cmd.enc.encoder, '#', cmd.enc.label)
  console.log('    qa:', JSON.stringify(cmd.qa))
  console.log('    filter_complex hiện diện:', cmd.args.some((a) => a.includes('concat=n=')))
  console.log('    args:\n    ', cmd.args.join(' '))

  // ── 4. Render thật ──
  console.log('\n[4] Render thực tế...')
  await new Promise((resolve) => {
    engine.startRender(
      {
        mainVideo: video,
        subtitle: sub,
        intro: null,
        outro,
        mergeEnabled: true,
        subtitleEngine: 'libass',
        hardware: 'cpu',
        quality: 'original',
        custom: { resolution: '640x480', fps: '24', bitrate: '600' },
        outputPath: output,
      },
      {
        onLog: (l, lvl) => console.log(`    [${lvl || 'info'}] ${l}`),
        onProgress: (p) => process.stdout.write(`\r    ${p.progress}% | fps=${(p.fps || 0).toFixed(1)} | speed=${(p.speed || 0).toFixed(2)}x | eta=${(p.eta || 0).toFixed(1)}s `),
        onDone: (d) => { console.log('\n    ✅ onDone:', JSON.stringify(d)); resolve() },
        onError: (e) => { console.log('\n    ❌ onError:', JSON.stringify(e)); process.exitCode = 1; resolve() }
      }
    )
  })
  const stat = fs.existsSync(output) ? fs.statSync(output) : null
  console.log('    output tồn tại:', !!stat, stat ? `(${(stat.size / 1024).toFixed(1)} KB)` : '')

  // Probe lại output để xác nhận hợp lệ
  const outMeta = await engine.probeMedia(output)
  console.log('    output probe:', outMeta.width + 'x' + outMeta.height, '@' + outMeta.fps + 'fps', 'audio=' + (outMeta.hasAudio ? 'có' : 'không'), 'dur=' + outMeta.duration.toFixed(1) + 's')
  if (!stat) throw new Error('KHÔNG TẠO RA FILE OUTPUT!')

  // ── 5. Unittest nhỏ ──
  console.log('\n[5] Unit test:')
  console.log('    escapeFilterPath:', engine.escapeFilterPath('C:\\My Folder\\a b.ass') === `C\\:/My Folder/a b.ass` ? 'PASS' : 'FAIL')
  const pp = engine.parseProgressLine('frame=  120 fps= 45.6 q=28.0 size= 128KB time=00:00:05.00 bitrate= 200kbits/s speed=1.5x', 10)
  console.log('    parseProgressLine:', pp && pp.progress === 50 && pp.fps === 45.6 ? 'PASS' : 'FAIL', pp)
  const qa = engine.qualityArgs('original', { bitrateAvg: 1000 }, null)
  console.log('    qualityArgs(original, 1000k):', qa.bitrate === 1000 && qa.maxrate === 1250 && qa.bufsize === 2000 ? 'PASS' : 'FAIL', qa)

  console.log('\n══════════ KẾT THÚC E2E — ' + (process.exitCode ? 'THẤT BẠI' : 'TẤT CẢ PASS') + ' ══════════')
  console.log('Thư mục test tạm:', dir)
}

main().catch((e) => {
  console.error('\n❌ E2E lỗi:', e)
  process.exit(1)
})