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
ok(/if \(kind === 'frame'\) frameStep\(dir \* size\)/.test(src), 'seekStep chế độ frame đi qua frameStep() (chỉ số frame nguyên)')
ok(/Math\.round\(\(v\.currentTime \|\| 0\) \* f\) \+ dir/.test(src), 'dùng chỉ số frame nguyên (Math.round) làm chuẩn')
ok(/fmtFrame/.test(src), 'có đồng hồ frame S:FF để nhìn thấy 1 frame')

// ── 7. Bước tua cho mũi tên ←/→: theo NÚT VỪA BẤM, mặc định 1 giây ──
//   Mô phỏng ĐÚNG logic seekStep()/stepByArrow() trong VideoPreview.jsx.
console.log('\n[7] Mũi tên ←/→ tua theo bước đang chọn (mặc định 1 giây)')
const applyStep = (mode, dir, curTime, fpsV, dur) => {
  if (mode.kind === 'frame') return stepTarget(curTime, dir * mode.size, fpsV, dur)
  const target = (curTime || 0) + dir * mode.size
  return Math.max(0, Math.min(dur || 0, target))
}
const DEFAULT_MODE = { kind: 'sec', size: 1 }
ok(DEFAULT_MODE.kind === 'sec' && DEFAULT_MODE.size === 1, 'chưa bấm nút nào → mặc định 1 giây')
ok(Math.abs(applyStep(DEFAULT_MODE, 1, 10, 24, 600) - 11) < 1e-9, 'mặc định → → nhảy +1s')
ok(Math.abs(applyStep(DEFAULT_MODE, -1, 10, 24, 600) - 9) < 1e-9, 'mặc định → ← lùi -1s')
ok(Math.abs(applyStep({ kind: 'sec', size: 5 }, 1, 10, 24, 600) - 15) < 1e-9, 'bấm +5s → mũi tên nhảy 5s')
ok(Math.abs(applyStep({ kind: 'sec', size: 5 }, -1, 10, 24, 600) - 5) < 1e-9, 'bấm -5s → mũi tên lùi 5s')
{
  const mode = { kind: 'frame', size: 1 }
  let t2 = 10
  for (let i = 0; i < 10; i++) t2 = applyStep(mode, 1, t2, 24, 600)
  ok(Math.abs(t2 - (10 + 10 / 24)) < 1e-9, `bấm 1 frame → 10 lần → đúng +10 frame (t=${t2.toFixed(4)}s)`)
  ok(t2 - 10 < 1, 'bước frame KHÔNG bị hiểu thành giây (10 lần < 1 giây)')
}
ok(applyStep({ kind: 'sec', size: 5 }, 1, 598, 24, 600) === 600, 'chặn biên: +5s sát cuối không vượt duration')
ok(applyStep({ kind: 'frame', size: 1 }, -1, 0, 24, 600) === 0, 'chặn biên: lùi frame ở frame 0 vẫn giữ 0')

// ── 8. Source: nút tua ghi nhớ bước, mũi tên dùng lại ──
console.log('\n[8] Source: nút tua ghi nhớ bước + mũi tên dùng đúng bước')
const vpSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'VideoPreview.jsx'), 'utf8')
ok(/const \[stepMode, setStepMode\] = useState\(\{ kind: 'sec', size: 1 \}\)/.test(vpSrc), 'có state stepMode, mặc định 1 giây')
ok(/const seekStep = \(kind, size, dir\)/.test(vpSrc), 'có seekStep(kind, size, dir) — bấm nút ghi nhớ bước')
ok(/const stepByArrow = \(dir, big\)/.test(vpSrc), 'có stepByArrow(dir, big) — mũi tên dùng bước đang chọn')
ok(/ArrowLeft'\) \{ e\.preventDefault\(\); stepByArrow\(-1, e\.shiftKey\) \}/.test(vpSrc), '← gọi stepByArrow(-1, shift)')
ok(/ArrowRight'\) \{ e\.preventDefault\(\); stepByArrow\(1, e\.shiftKey\) \}/.test(vpSrc), '→ gọi stepByArrow(1, shift)')
ok(!/step\(e\.shiftKey \? -5 : -1\)/.test(vpSrc), 'đã bỏ mũi tên cứng ±1s cũ')
ok(/seekStep\('frame', 1, -1\)/.test(vpSrc) && /seekStep\('frame', 1, 1\)/.test(vpSrc), '2 nút frame → seekStep(frame,1,±1)')
ok(/seekStep\('sec', 1, -1\)/.test(vpSrc) && /seekStep\('sec', 1, 1\)/.test(vpSrc), '2 nút 1s → seekStep(sec,1,±1)')
ok(/seekStep\('sec', 5, -1\)/.test(vpSrc) && /seekStep\('sec', 5, 1\)/.test(vpSrc), '2 nút 5s → seekStep(sec,5,±1)')
ok(/\[duration, fps, stepMode\]/.test(vpSrc), 'effect bàn phím phụ thuộc stepMode (luôn dùng bước mới nhất)')
ok(/pv\.stepMode/.test(vpSrc) && /stepLabel/.test(vpSrc), 'UI hiện nhãn bước tua (pv.stepMode + stepLabel)')
ok(/active=\{stepMode\.kind/.test(vpSrc), 'nút đang chọn được highlight (prop active)')
const i18nSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n.js'), 'utf8')
ok((i18nSrc.match(/'pv\.stepMode':/g) || []).length === 2, 'khoá pv.stepMode có ở cả VI + EN')
ok((i18nSrc.match(/'pv\.stepModeTip':/g) || []).length === 2, 'khoá pv.stepModeTip có ở cả VI + EN')

console.log(failed === 0 ? '\n✅ PASS' : `\n❌ FAIL (${failed})`)
process.exit(failed === 0 ? 0 : 1)
