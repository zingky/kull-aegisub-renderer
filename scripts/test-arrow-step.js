/**
 * test-arrow-step.js — kiểm chứng THẬT trên bundle production (jsdom):
 *   Bấm nút tua nào (1 frame / 1s / 5s) thì mũi tên ←/→ tua đúng bước đó;
 *   chưa bấm gì → mặc định 1 giây.
 *
 * Video được "chọn" qua renderAPI mô phỏng (probeMedia giả) nên không cần file thật.
 * jsdom không cài đặt HTMLMediaElement.currentTime → ta tự gắn getter/setter để
 * quan sát ĐÚNG giá trị mà app ghi vào video.
 */
'use strict'
const { JSDOM, VirtualConsole } = require('jsdom')

let fail = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✅' : '❌'} ${msg}`); if (!cond) fail++ }

const DURATION = 600
const FPS = 24

const { entryBundle, runnableBundle } = require('./_bundle')
console.log(`\nBundle: ${entryBundle().f}`)

const vc = new VirtualConsole()
vc.on('error', () => {})
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  url: 'http://localhost/index.html',
  virtualConsole: vc,
})
const w = dom.window

// ── renderAPI mô phỏng: file video "ảo" + probe giả (không cần ffmpeg) ──
let vTime = 10 // thời điểm hiện tại của video (ta tự quản lý)
const FAKE_VIDEO = 'D:\\fake\\sample.mp4'
w.renderAPI = {
  getPathForFile: (f) => f.path || '',
  probeMedia: async () => ({ duration: DURATION, fps: FPS, width: 1920, height: 1080, videoCodec: 'h264', hasAudio: true }),
  selectFile: async () => FAKE_VIDEO,
  selectDir: async () => 'D:\\fake',
  startRender: async () => {},
  cancelRender: () => {},
  openFolder: async () => '',
  checkBin: async () => ({ ffmpeg: true, ffprobe: true, vsfilter: true, vsfiltermod: true, avisynth: true }),
  getEncoders: async () => ['cpu'],
  getAppVersion: async () => '2.0.2-test',
  extractThumbs: async () => ({ thumbs: [], dir: null }),
  cleanupThumbs: () => {},
  onProgress: () => () => {},
  onLog: () => () => {},
  onDone: () => () => {},
  onError: () => () => {},
}
for (const k of ['window', 'document', 'navigator', 'Node', 'HTMLElement', 'getComputedStyle',
  'XMLHttpRequest', 'CustomEvent', 'Event', 'MouseEvent', 'KeyboardEvent', 'File', 'Blob', 'URL']) {
  if (w[k] === undefined) continue
  try { global[k] = w[k] } catch {
    try { Object.defineProperty(global, k, { value: w[k], configurable: true, writable: true }) } catch (e) {}
  }
}
global.window = w

const root = () => w.document.querySelector('#root')
const txt = () => (root() ? root().textContent.replace(/\s+/g, ' ') : '')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** Tìm <video> và gắn currentTime/duration (jsdom không cài đặt) → quan sát được seek */
function hookVideo() {
  const v = w.document.querySelector('video')
  if (!v) return null
  Object.defineProperty(v, 'currentTime', { configurable: true, get: () => vTime, set: (x) => { vTime = x } })
  Object.defineProperty(v, 'duration', { configurable: true, get: () => DURATION })
  return v
}
/** Text của nhãn "bước tua" (khoá pv.stepMode) */
const hint = () => {
  const el = w.document.querySelector('#pv-step-hint')
  return el ? el.textContent.replace(/\s+/g, ' ').trim() : '(không có #pv-step-hint)'
}
/** Bấm nút theo attribute title */
function clickTitle(title) {
  const b = [...w.document.querySelectorAll('button')].find((x) => x.getAttribute('title') === title)
  if (!b) throw new Error(`không thấy nút title="${title}"`)
  b.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }))
}
/** Nhấn mũi tên trái/phải trên window (đúng như app lắng nghe) */
function pressArrow(dir, shiftKey = false) {
  w.dispatchEvent(new w.KeyboardEvent('keydown', {
    code: dir < 0 ? 'ArrowLeft' : 'ArrowRight', shiftKey, bubbles: true, cancelable: true,
  }))
}

async function main() {
  w.eval(runnableBundle())
  await wait(900)
  ok(root() && root().children.length > 0, 'app mount được trong jsdom')

  // Chọn "File Video chính" qua DropZone → preview + thẻ <video> xuất hiện
  const dz = [...w.document.querySelectorAll('div')].filter((d) => d.textContent.includes('File Video chính')).pop()
  ok(!!dz, 'tìm thấy DropZone "File Video chính"')
  if (!dz) process.exit(1)
  dz.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }))
  await wait(2500)

  const settle = async () => { await wait(150); hookVideo() }
  const video = hookVideo()
  ok(!!video, 'preview đã render thẻ <video> (đã chọn được video)')
  if (!video) { console.log('   body:', JSON.stringify(txt().slice(0, 300))); process.exit(1) }

  // ── 1. Mặc định: chưa bấm nút tua nào → mũi tên = 1 giây ──
  console.log('\n[1] Mặc định (chưa bấm nút nào) mũi tên = 1 giây')
  ok(/1s/.test(hint()), `nhãn hiện bước mặc định 1s ("${hint()}")`)
  vTime = 10
  pressArrow(1); await settle()
  ok(Math.abs(vTime - 11) < 1e-6, `→ nhảy +1s (10 → ${vTime})`)
  pressArrow(-1); await settle()
  ok(Math.abs(vTime - 10) < 1e-6, `← lùi -1s (11 → ${vTime})`)

  // ── 2. Bấm nút "+5s" → mũi tên thành 5 giây ──
  console.log('\n[2] Bấm nút "+5s" → mũi tên tua 5s')
  clickTitle('+5s'); await settle()
  ok(/5s/.test(hint()), `nhãn đổi thành 5s ("${hint()}")`)
  ok(Math.abs(vTime - 15) < 1e-6, `bấm nút tua ngay +5s (10 → ${vTime})`)
  pressArrow(1); await settle()
  ok(Math.abs(vTime - 20) < 1e-6, `→ nhảy +5s (15 → ${vTime})`)
  pressArrow(-1); await settle()
  ok(Math.abs(vTime - 15) < 1e-6, `← lùi -5s (20 → ${vTime})`)

  // ── 3. Bấm nút "1 frame" → mũi tên nhảy ĐÚNG 1 frame (không phải 1s) ──
  console.log('\n[3] Bấm nút frame → mũi tên nhảy đúng 1 frame')
  clickTitle('Tiến 1 frame'); await settle()
  ok(/1 frame/.test(hint()), `nhãn đổi thành "1 frame" ("${hint()}")`)
  const afterFrameBtn = vTime
  pressArrow(1); await settle()
  ok(Math.abs(vTime - (afterFrameBtn + 1 / FPS)) < 1e-6,
    `→ nhảy +1 frame (+${(1 / FPS).toFixed(4)}s; ${afterFrameBtn.toFixed(4)} → ${vTime.toFixed(4)})`)
  ok(vTime - afterFrameBtn < 1, 'bước frame KHÔNG bị hiểu thành giây')
  pressArrow(-1); await settle()
  ok(Math.abs(vTime - afterFrameBtn) < 1e-6, `← lùi đúng 1 frame về ${afterFrameBtn.toFixed(4)}`)

  // ── 4. Bấm "-1s" → quay lại 1 giây ──
  console.log('\n[4] Bấm nút "-1s" → mũi tên quay lại 1s')
  clickTitle('-1s'); await settle()
  ok(/1s/.test(hint()) && !/frame/.test(hint()), `nhãn quay lại 1s ("${hint()}")`)
  const after1s = vTime
  pressArrow(1); await settle()
  ok(Math.abs(vTime - (after1s + 1)) < 1e-6, `→ nhảy +1s (${after1s.toFixed(4)} → ${vTime.toFixed(4)})`)

  // ── 5. Chặn biên ──
  console.log('\n[5] Chặn biên (không vượt 0 / duration)')
  vTime = 0
  pressArrow(-1); await settle()
  ok(vTime === 0, '← ở đầu video → giữ 0 (không âm)')
  clickTitle('+5s'); await settle()
  vTime = DURATION - 1
  pressArrow(1); await settle()
  ok(vTime === DURATION, `→ sát cuối → chặn đúng duration (${vTime})`)

  // ── 6. Lối tắt Shift+←/→ vẫn là ±5s ──
  console.log('\n[6] Shift + mũi tên vẫn là lối tắt ±5s')
  clickTitle('+1s'); await settle()
  vTime = 100
  pressArrow(1, true); await settle()
  ok(Math.abs(vTime - 105) < 1e-6, `Shift+→ nhảy +5s (100 → ${vTime})`)
  pressArrow(-1, true); await settle()
  ok(Math.abs(vTime - 100) < 1e-6, `Shift+← nhảy -5s (105 → ${vTime})`)

  // ── 7. Đổi ngôn ngữ EN → nhãn theo tiếng Anh ──
  console.log('\n[7] Đổi sang tiếng Anh → nhãn đổi theo')
  const en = [...w.document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'EN')
  ok(!!en, 'có nút EN')
  if (en) {
    en.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }))
    await wait(500); hookVideo()
    ok(/step 1s/.test(hint()), `nhãn EN = "step 1s" ("${hint()}")`)
  }

  if (fail) { console.log(`\n❌ FAIL (${fail})`); process.exit(1) }
  console.log('\n✅ PASS — mũi tên ←/→ tua theo đúng bước đang chọn')
  process.exit(0)
}

main().catch((e) => { console.error('lỗi test:', e); process.exit(1) })
