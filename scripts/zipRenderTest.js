/**
 * zipRenderTest.js — chạy bằng ELECTRON_RUN_AS_NODE của app đã giải nén
 * Kiểm tra: engine trong app.asar + bin/ trong resources hoạt động từ thư mục lạ.
 *   node: <extracted>\Kull Aegisub Renderer.exe -e  ... (hoặc truyền file này)
 */
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const rp = process.resourcesPath.replace(/\\/g, '/')
const paths = require(rp + '/app.asar/electron/paths.js')
const engine = require(rp + '/app.asar/electron/ffmpegEngine.js')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kull-zip-'))
const video = path.join(dir, 'sample.mp4')
const outro = path.join(dir, 'outro.mp4')
const sub = path.join(dir, 'sub.ass')
const output = path.join(dir, 'out.mp4')

console.log('[1] BIN_DIR =', paths.BIN_DIR)
console.log('    ffmpeg  =', paths.ffmpegPath)
console.log('    ffprobe =', paths.ffprobePath)

// Video mẫu 2s
spawnSync(paths.ffmpegPath, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x480:rate=24:duration=2',
  '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', video])
spawnSync(paths.ffmpegPath, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=24:duration=1',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', outro])
if (!fs.existsSync(video) || !fs.existsSync(outro)) throw new Error('khong tao duoc video mau')

fs.writeFileSync(sub, [
  '[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 640', 'PlayResY: 480', '',
  '[V4+ Styles]', 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  'Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,20,1', '',
  '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  'Dialogue: 0,0:00:00.00,0:00:02.00,Default,,0,0,0,,ZIP RENDER OK',
].join('\r\n'))

async function main() {
  console.log('\n[2] probeMedia (dung ffprobe trong resources/bin)')
  const meta = await engine.probeMedia(video, 'vi')
  console.log('    ', meta.width + 'x' + meta.height, '| fps=' + meta.fps, '| dur=' + meta.duration)
  if (meta.width !== 640 || meta.height !== 480) throw new Error('probe sai resolution')

  console.log('\n[3] buildRenderCommand (libass + ghep outro)')
  const cmd = await engine.buildRenderCommand({
    mainVideo: video, subtitle: sub, intro: null, outro, mergeEnabled: true,
    subtitleEngine: 'libass', hardware: 'cpu', quality: 'original',
    custom: { resolution: '640x480', fps: '24', bitrate: '600' }, outputPath: output,
  })
  console.log('    encoder:', cmd.enc.encoder, '| concat:', cmd.args.some((a) => a.includes('concat=n=')))

  console.log('\n[4] Render that...')
  await new Promise((resolve) => {
    engine.startRender({
      mainVideo: video, subtitle: sub, intro: null, outro, mergeEnabled: true,
      subtitleEngine: 'libass', hardware: 'cpu', quality: 'original',
      custom: { resolution: '640x480', fps: '24', bitrate: '600' }, outputPath: output,
    }, {
      onLog: () => {},
      onProgress: () => {},
      onDone: (d) => { console.log('    onDone:', JSON.stringify(d)); resolve() },
      onError: (e) => { console.log('    onError:', JSON.stringify(e)); process.exitCode = 1; resolve() },
    })
  })

  const st = fs.existsSync(output) ? fs.statSync(output) : null
  if (!st || st.size < 1000) throw new Error('output khong hop le')
  console.log('\nPASS — render tu ban giai nen ZIP OK:', (st.size / 1024).toFixed(0) + ' KB')
  console.log('Thu muc test:', dir)
}

main().catch((e) => { console.error('FAIL:', e.message); process.exitCode = 1 })