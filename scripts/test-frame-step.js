// test-frame-step.js — hồi quy nút "1 frame" của preview phải lệch ĐÚNG 1 frame
//   Lỗi cũ: step(1/fps) cộng số thực vào video.currentTime.
//     • file 23.976fps (24000/1001) → 1/fps = 0.041708… cộng dồn lỗi float
//     • currentTime bị browser snap về frame gần nhất → đọc lại đã tròn, lệch ngay
//     • kết quả: bấm nhiều lần nhảy 0.1s/0.04s tùy, không phải 1 frame
//   Sửa: quy đổi currentTime → chỉ số frame nguyên, ±1, ngược lại. Không tích luỹ sai số.
'use strict'
const fs = require('fs')
const path = require('path')

let failed = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed++ }

// ── Logic giống hệt hàm frameStep() trong VideoPreview.jsx ──
const fpsRounded = (fps) => {
  const f = Number(fps)
  if (!isFinite(f) || f <= 0) return 24
  return Math.max(1, Math.round(f))
}
const stepTarget = (curTime, dir, fps, duration) => {
  const f = Number(fps) > 0 ? Number(fps) : 24
  const idx = Math.round((curTime || 0) * f) + dir
  const d = duration || 0
  if (idx <= 0) return 0
  const last = Math.ceil(d * f)
  if (idx >= last) return d
  return idx / f
}
// Mô phỏng <video>: currentTime bị SNAP về frame gần nhất (giống browser thật)
const snap = (t, fps) => Math.round(t * fps) / fps

// ── 1. Hàm fpsRounded chuẩn hoá đúng ──
console.log('\n[1] fpsRounded — chuẩn hoá fps về số nguyên chuẩn')
ok(fpsRounded(23.976) === 24, '23.976 (24000/1001) → 24')
ok(fpsRounded(29.97) === 30, '29.97 → 30')
ok(fpsRounded(24) === 24, '24 → 24')
ok(fpsRounded(0) === 24, 'fps=0 → 24 (không chia cho 0)')
ok(fpsRounded(NaN) === 24, 'fps=NaN → 24')
ok(fpsRounded(undefined) === 24, 'fps=undefined → 24')

// ── 2. Nút phải lệch ĐÚNG 1 frame mỗi lần bấm ──
console.log('\n[2] Mỗi lần bấm lệch đúng 1 frame (không cộng dồn sai số)')
for (const fps of [23.976, 24, 29.97, 30, 60]) {
  // Mô phỏng bấm liên tục 20 lần từ giữa video, browser snap sau mỗi lần.
  // Kỳ vọng: CHỈ SỐ FRAME tăng đúng 1 mỗi lần — đó mới là "1 frame" thật.
  // (currentTime luôn nằm trên lưỡi frame sau khi snap, nên đừng so với
  //  thời gian chưa snap — đó là sai lầm làm cho test báo FAIL giả.)
  let t = 60
  const fr = fpsRounded(fps)
  const bad = []
  for (let i = 0; i < 20; i++) {
    t = snap(stepTarget(t, 1, fps, 600), fps)
    if (Math.round(t * fr) !== fr * 60 + (i + 1)) bad.push(i + 1)
  }
  ok(bad.length === 0, `fps=${fps}: 20 lần bấm → frame ${Math.round(t * fr)} (mỗi lần đúng +1)`)
}

// ── 3. Lùi cũng đúng 1 frame ──
console.log('\n[3] Nút lùi lệch đúng 1 frame')
for (const fps of [23.976, 24, 60]) {
  let t = 60
  const fr = fpsRounded(fps)
  const bad = []
  for (let i = 0; i < 20; i++) {
    t = snap(stepTarget(t, -1, fps, 600), fps)
    if (Math.round(t * fr) !== fr * 60 - (i + 1)) bad.push(i + 1)
  }
  ok(bad.length === 0, `fps=${fps}: 20 lần bấm → frame ${Math.round(t * fr)} (mỗi lần đúng -1)`)
}

// ── 4. Chứng minh lỗi cũ (cộng số thực) thực sự SAI ──
console.log('\n[4] Lỗi cũ step(1/fps) sai ở file 23.976fps (đây là lý do cần sửa)')
{
  const fps = 23.976
  let t = 60
  let drift = 0
  for (let i = 0; i < 20; i++) {
    t = snap(t + 1 / fps, fps) // cách cũ: cộng thẳng số thực
    drift = Math.abs(t - (60 + (i + 1) / fps))
  }
  console.log(`     cách cũ sau 20 lần: t=${t.toFixed(6)} (lệch ${drift.toFixed(6)}s, ~${(drift * fps).toFixed(2)} frame)`)
  ok(drift * fps > 0.1, 'cách cũ lệch > 0.1 frame → xác nhận lỗi có thật')
}

// ── 5. Chặn vượt biên ──
console.log('\n[5] Không vượt ra ngoài video')
// Bắt đầu ĐÚNG ở frame 0 (currentTime=0). Ở 0.1s/24fps thì đã là frame 2,
// lùi 1 frame ra frame 1 là hành vi ĐÚNG — đừng dùng 0.1 làm "đầu".
ok(stepTarget(0, -1, 24, 600) === 0, 'lùi ở frame 0 → giữ 0 (không âm)')
ok(stepTarget(0, -1, 60, 600) === 0, 'lùi ở frame 0 (60fps) → giữ 0')
ok(stepTarget(0.041, -1, 24, 600) === 0, 'lùi ở frame 1 (0.0417s) → về đúng frame 0')
ok(stepTarget(599.9, 1, 24, 600) <= 600, 'tiến ở cuối → không vượt duration')
ok(stepTarget(599.99, 1, 24, 600) === 600, 'tiến ở frame cuối → giữ đúng duration')
ok(stepTarget(0, -5, 24, 0) === 0, 'duration=0 → vẫn 0, không NaN')
ok(isFinite(stepTarget(5, 1, 0, 600)), 'fps=0 → kết quả hữu hạn, không Infinity')

// ── 6. VideoPreview.jsx phải dùng frameStep, không còn step(±1/fps) ──
console.log('\n[6] Source: nút frame phải gọi frameStep()')
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'VideoPreview.jsx'), 'utf8')
ok(!/step\(\s*[-+]\s*1\s*\/\s*fps\s*\)/.test(src), 'không còn step(±1/fps) — cộng số thực đã bị gỡ')
ok(/const frameStep = \(dir\)/.test(src), 'frameStep(dir) được định nghĩa')
ok((src.match(/frameStep\((-?\d)\)/g) || []).length === 2, 'cả 2 nút đều gọi frameStep()')
ok(/Math\.round\(\(v\.currentTime \|\| 0\) \* f\) \+ dir/.test(src), 'dùng chỉ số frame nguyên (Math.round) làm chuẩn')
ok(/fmtFrame/.test(src), 'có đồng hồ frame S:FF để nhìn thấy 1 frame')

console.log(failed === 0 ? '\n✅ PASS' : `\n❌ FAIL (${failed})`)
process.exit(failed === 0 ? 0 : 1)
