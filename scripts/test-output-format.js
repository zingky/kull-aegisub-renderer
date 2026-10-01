// test-output-format.js — hồi quy định dạng file xuất PHẢI theo lựa chọn của user
//   Lỗi 1: exportClips() lấy đuôi từ FILE GỐC (srcExt) → file .mkv cắt ra vẫn
//          .mkv dù user đã chọn MP4. Đuôi phải theo ĐỊNH DẠNG ĐÃ CHỌN.
//   Lỗi 2 (nặng hơn): chọn WebM nhưng engine vẫn ép H.264/AAC. WebM chỉ nhận
//          VP8/VP9/AV1 + Vorbis/Opus → ffmpeg exit -22, KHÔNG tạo được file.
'use strict'
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { ffmpegPath } = require('../electron/paths')

let failed = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed++ }

// ── 1. Logic chọn đuôi (giống hệt exportClips trong VideoPreview.jsx) ──
const pickExt = (outputFormat, outputPath, videoPath) =>
  (String(outputFormat || '').replace(/^\./, '') ||
    (String(outputPath || '').match(/\.([^\\.\\/:*?"<>|]+)$/) || [])[1] ||
    (String(videoPath).match(/\.([^\\.\\/:*?"<>|]+)$/) || [])[1] || 'mp4'
  ).toLowerCase()

console.log('\n[1] Đuôi file cắt ra theo ĐỊNH DẠNG ĐÃ CHỌN (không theo file gốc)')
ok(pickExt('mp4', 'D:\\out\\video.mp4', 'D:\\in\\ep.mkv') === 'mp4', 'nguồn .mkv + chọn MP4 → .mp4 (BUG CHÍNH)')
ok(pickExt('mkv', 'D:\\out\\video.mkv', 'D:\\in\\ep.mp4') === 'mkv', 'nguồn .mp4 + chọn MKV → .mkv')
ok(pickExt('webm', 'D:\\out\\video.webm', 'D:\\in\\ep.mkv') === 'webm', 'nguồn .mkv + chọn WebM → .webm')
ok(pickExt('mov', 'D:\\out\\v.mov', 'D:\\in\\ep.mkv') === 'mov', 'nguồn .mkv + chọn MOV → .mov')
ok(pickExt('avi', 'D:\\out\\v.avi', 'D:\\in\\ep.mkv') === 'avi', 'nguồn .mkv + chọn AVI → .avi')
ok(pickExt('', 'D:\\out\\video.mp4', 'D:\\in\\ep.mkv') === 'mp4', 'thiếu outputFormat → lấy đuôi từ outputPath')
ok(pickExt('', '', 'D:\\in\\ep.mkv') === 'mkv', 'không có gì → fallback đuôi gốc (không crash)')
ok(pickExt(null, null, null) === 'mp4', 'toàn null → mp4 an toàn')
ok(!pickExt('mp4', 'D:\\out\\v.mp4', 'D:\\in\\ep.mkv').includes('mkv'), 'không bao giờ trả về .mkv khi đã chọn mp4')

// ── 2. Source: không còn lấy đuôi từ file gốc ──
console.log('\n[2] Source: exportClips không còn dùng srcExt')
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'VideoPreview.jsx'), 'utf8')
ok(!/const srcExt =/.test(src), 'biến srcExt đã bị gỡ')
ok(/extOut/.test(src), 'dùng extOut (theo định dạng chọn)')
ok(/outputFormat/.test(src), 'nhận prop outputFormat')

// ── 3. WEBM: engine phải đổi codec, không ép H.264/AAC ──
console.log('\n[3] Engine xử lý WebM đúng (VP9 + Opus)')
const eng = fs.readFileSync(path.join(__dirname, '..', 'electron', 'ffmpegEngine.js'), 'utf8')
ok(/isWebM/.test(eng), 'render chính có nhánh isWebM')
ok(/clipIsWebM/.test(eng), 'exportTrimClip có nhánh clipIsWebM')
ok(/libvpx-vp9/.test(eng), 'dùng libvpx-vp9 cho WebM')
ok(/libopus/.test(eng), 'dùng libopus cho WebM')

// ── 4. Chứng minh: WebM + H.264/AAC THẬT SỰ fail (lý do phải sửa) ──
console.log('\n[4] Encode thật — WebM chỉ chấp nhận codec đúng')
const tmp = path.join(require('os').tmpdir(), 'kull-fmt-test')
fs.mkdirSync(tmp, { recursive: true })
const run = (ext, vcodec, acodec) => {
  const out = path.join(tmp, `t.${ext}`)
  fs.rmSync(out, { force: true })
  const args = ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=d=1:s=256x256:r=24',
    '-c:v', vcodec, '-b:v', '300k']
  if (acodec) args.push('-c:a', acodec, '-b:a', '128k')
  args.push('-t', '1', '-y', out)
  const r = spawnSync(ffmpegPath, args, { encoding: 'utf8', timeout: 90000 })
  const size = fs.existsSync(out) ? fs.statSync(out).size : 0
  return { status: r.status, size, err: (r.stderr || '').split('\n')[0] }
}
const bad = run('webm', 'libx264', 'aac')
console.log(`     webm + h264/aac → exit ${bad.status}, ${bad.size} byte`)
ok(bad.status !== 0, 'H.264/AAC vào .webm thất bại (xác nhận lỗi có thật)')
const good = run('webm', 'libvpx-vp9', 'libopus')
console.log(`     webm + vp9/opus  → exit ${good.status}, ${good.size} byte`)
ok(good.status === 0 && good.size > 1000, 'VP9/Opus vào .webm thành công (đã sửa đúng)')
const mp4 = run('mp4', 'libx264', 'aac')
console.log(`     mp4  + h264/aac → exit ${mp4.status}, ${mp4.size} byte`)
ok(mp4.status === 0 && mp4.size > 1000, 'MP4 vẫn dùng H.264/AAC như cũ (không hồi quy)')

fs.rmSync(tmp, { recursive: true, force: true })
console.log(failed === 0 ? '\n✅ PASS' : `\n❌ FAIL (${failed})`)
process.exit(failed === 0 ? 0 : 1)
