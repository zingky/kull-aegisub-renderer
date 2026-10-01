// test-clip-audio.js — clip A→B phải có ĐỈNH âm thanh < 0 dBFS để không méo khi Facebook re-encode
//   Lỗi đã gặp: clip xuất ra có True Peak +1.4 dBFS (vượt 0). Nghe trên VLC thấy bình thường
//   (VLC không nén) nhưng Facebook chuẩn hoá ~−14 LUFS rồi nén lại → phần đỉnh bị cắt → tiếng "rè".
//   Sửa: exportTrimClip áp alimiter chặn đỉnh về −1.5 dBFS (limit = 10^(-1.5/20) = 0.8413).
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const { ffmpegPath } = require('../electron/paths')

let failed = 0
const ok = (c, m) => { console.log(`  ${c ? '✅' : '❌'} ${m}`); if (!c) failed++ }

// ── 1. Source: engine PHẢI thật sự áp alimiter trong exportTrimClip ──
console.log('\n[1] Source: exportTrimClip áp alimiter chặn đỉnh')
const eng = fs.readFileSync(path.join(__dirname, '..', 'electron', 'ffmpegEngine.js'), 'utf8')
const fn = (eng.match(/async function exportTrimClip[\s\S]*?\n}/) || [''])[0]
ok(fn.length > 0, 'đọc được thân hàm exportTrimClip')
ok(/alimiter=limit=0\.8413/.test(fn), 'có alimiter limit=0.8413 (−1.5 dBFS) trong exportTrimClip')
ok(/level=disabled/.test(fn), 'level=disabled — không kéo nhỏ âm lượng tổng thể')
ok(/if \(meta\.hasAudio\) \{[\s\S]*?alimiter/.test(fn), 'chỉ thêm limiter khi video CÓ audio (không thừa)')

// ── helpers ──
const tmp = path.join(os.tmpdir(), 'kull-clip-audio')
fs.mkdirSync(tmp, { recursive: true })
// volumedetect: đỉnh mẫu lớn nhất (dB so với 0 dBFS) — dễ đọc & chính xác cho mục đích này
const maxVol = (file) => {
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-nostats', '-i', file,
    '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8', timeout: 60000 })
  const m = (r.stderr || '').match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/)
  return m ? parseFloat(m[1]) : null
}
// ebur128 peak=true: True Peak (bắt cả đỉnh inter-sample) — đúng chuẩn đã dùng lúc chẩn đoán
const truePeak = (file) => {
  const r = spawnSync(ffmpegPath, ['-hide_banner', '-nostats', '-i', file,
    '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'], { encoding: 'utf8', timeout: 60000 })
  const m = (r.stderr || '').match(/True peak:[\s\S]*?Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/)
  return m ? parseFloat(m[1]) : null
}

// ── 2. Tạo nguồn VƯỢT 0 dBFS (tái hiện đúng tình huống gây méo) ──
//   Lưu ý: nguồn `sine` của ffmpeg có biên độ RẤT thấp (~−18 dBFS) → phải đo rồi
//   khuếch đại theo mức thực tế, KHÔNG hard-code hệ số (dễ sai như bản đầu).
console.log('\n[2] Nguồn âm thanh vượt 0 dBFS (tái hiện lỗi méo)')
const raw = path.join(tmp, 'raw.wav')
const gen = spawnSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
  '-i', 'sine=frequency=1000:duration=3:sample_rate=48000', '-c:a', 'pcm_f32le', '-y', raw],
  { encoding: 'utf8', timeout: 60000 })
ok(gen.status === 0 && fs.existsSync(raw), 'tạo được nguồn sine 1 kHz (float WAV)')
const rawPeak = maxVol(raw)
const gainDb = Math.ceil(3 - (rawPeak || 0)) // đưa đỉnh lên ~+3 dBFS
console.log(`     sine gốc    : max_volume = ${rawPeak} dB → khuếch đại +${gainDb} dB`)
const src = path.join(tmp, 'loud.wav')
const amp = spawnSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-i', raw,
  '-af', `volume=${gainDb}dB`, '-c:a', 'pcm_f32le', '-y', src], { encoding: 'utf8', timeout: 60000 })
ok(amp.status === 0 && fs.existsSync(src), 'khuếch đại OK (giữ float nên >0 dBFS không bị cắt sớm)')
//   Thước đo CHÍNH là ebur128 True Peak: `volumedetect` KẸP ở 0 dB nên không thấy
//   được mức vượt 0 — đây chính là lý do phải đo True Peak mới phát hiện ra lỗi méo.
const tpBefore = truePeak(src)
console.log(`     nguồn gốc   : True Peak = ${tpBefore} dBFS`)
ok(tpBefore !== null && tpBefore > 0, `nguồn có đỉnh > 0 dBFS (${tpBefore} dBFS) — đúng tình huống gây méo`)

// ── 3. Áp ĐÚNG chuỗi filter của engine → đỉnh phải hạ xuống ≤ 0 ──
console.log('\n[3] Sau alimiter (đúng chuỗi engine dùng) đỉnh phải ≤ 0 dBFS')
const lim = path.join(tmp, 'limited.wav')
const fix = spawnSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-i', src,
  '-af', 'alimiter=limit=0.8413:level=disabled:latency=true', '-c:a', 'pcm_f32le', '-y', lim],
  { encoding: 'utf8', timeout: 60000 })
ok(fix.status === 0 && fs.existsSync(lim), 'encode qua alimiter thành công')
const tpAfter = truePeak(lim)
console.log(`     sau limiter : True Peak = ${tpAfter} dBFS`)
ok(tpAfter !== null && tpAfter <= 0, `True Peak sau limiter ≤ 0 dBFS (${tpAfter} dBFS)`)
ok(tpAfter !== null && tpBefore !== null && tpAfter < tpBefore, `limiter hạ đỉnh (${tpBefore} → ${tpAfter} dBFS)`)

// ── 4. Kiểm chứng chéo bằng volumedetect (đỉnh mẫu) ──
console.log('\n[4] Kiểm chứng chéo bằng volumedetect (đỉnh mẫu)')
const vAfter = maxVol(lim)
console.log(`     sau limiter : max_volume = ${vAfter} dB`)
ok(vAfter !== null && vAfter <= 0, `đỉnh mẫu sau limiter ≤ 0 dBFS (${vAfter} dB)`)

fs.rmSync(tmp, { recursive: true, force: true })
console.log(failed === 0 ? '\n✅ PASS' : `\n❌ FAIL (${failed})`)
process.exit(failed === 0 ? 0 : 1)
