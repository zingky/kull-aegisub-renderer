/**
 * repro-select.js — Tái hiện lỗi "chọn file video làm giao diện biến mất"
 * Renderer thật (build từ Vite) chạy trong jsdom + renderAPI mô phỏng dùng ffprobe thật.
 */
'use strict'
const { JSDOM, VirtualConsole } = require('jsdom')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const engine = require('../electron/ffmpegEngine')
const { ffmpegPath } = require('../electron/paths')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kull-repro-'))
// Tự dọn thư mục test khi process kết thúc (dù pass hay lỗi)
process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }) } catch (e) {} })
const video = path.join(dir, 'sample.mp4')
spawnSync(ffmpegPath, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x480:rate=24:duration=3',
  '-c:v', 'libx264', '-preset', 'veryfast', video], { encoding: 'utf8', stdio: 'ignore' })
console.log('Video mẫu:', video)

// Bundle production được build từ `npm run build`
const assetsDir = path.join(__dirname, '..', 'dist', 'assets')
// Từ v2.0 có code-splitting (JASSUB worker/fonts) → dùng helper chọn đúng entry chunk (createRoot)
const { entryBundle, runnableBundle } = require('./_bundle')
const jsBundle = entryBundle().f
const bundleSrc = runnableBundle()
console.log('Bundle:', jsBundle, `(${(bundleSrc.length / 1024).toFixed(0)} KB)`)

const vc = new VirtualConsole()
vc.on('error', (...a) => console.log('  [jsdom-console-error]', ...a))
vc.on('warn', (...a) => console.log('  [jsdom-console-warn]', ...a))

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  runScripts: 'dangerously', // cho phép <script type="module"> chạy trong DOM
  resources: 'usable', // nạp script từ data URL
  pretendToBeManual: true,
  pretendToBeVisual: true,
  url: 'file:///repo/index.html',
  virtualConsole: vc,
})
const w = dom.window

// renderAPI mô phỏng — probeMedia dùng ffprobe THẬT
w.renderAPI = {
  getPathForFile: (f) => f.path || '',
  probeMedia: (p) => engine.probeMedia(p),
  selectFile: async () => video,
  selectDir: async () => dir,
  startRender: async (o) => {},
  cancelRender: () => {},
  openFolder: async () => '',
  checkBin: async () => ({ ffmpeg: true, ffprobe: true, vsfilter: true, vsfiltermod: true, avisynth: true }),
  getEncoders: async () => ['cpu'],
  getAppVersion: async () => '2.0.0-test',
  onProgress: (cb) => () => {},
  onLog: (cb) => () => {},
  onDone: (cb) => () => {},
  onError: (cb) => () => {},
}

// Đồng bộ global cho bundle
for (const k of ['window', 'document', 'navigator', 'Node', 'HTMLElement', 'getComputedStyle', 'CSS',
  'XMLHttpRequest', 'CustomEvent', 'Event', 'MouseEvent', 'File', 'Blob', 'URL', 'TextEncoder', 'TextDecoder']) {
  if (w[k] === undefined) continue
  try {
    global[k] = w[k]
  } catch {
    try { Object.defineProperty(global, k, { value: w[k], configurable: true, writable: true }) } catch (e) {}
  }
}
global.window = w

// Bắt lỗi unbounded
w.addEventListener('error', (e) => console.log('  ⚠ WINDOW ERROR:', e.message, '\n   ', (e.error && e.error.stack || '').split('\n').slice(0, 6).join('\n    ')))
w.addEventListener('unhandledrejection', (e) => console.log('  ⚠ UNHANDLED REJECTION:', String(e.reason && e.reason.stack || e.reason)))

async function main() {
  // jsdom KHÔNG hỗ trợ ES module (`<script type="module">` bị bỏ qua) → nạp bundle bằng eval.
  // `bundleSrc` từ `_bundle.runnableBundle()` đã shim `import.meta.url` + bỏ re-export ESM.
  try {
    w.eval(bundleSrc)
  } catch (e) {
    console.log('  ❌ Lỗi nạp bundle:', (e && e.message) || e)
    process.exit(1)
  }
  // chờ tối đa 8s cho đến khi #root có nội dung
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 200))
    if (w.document.querySelector('#root')?.children.length) break
  }
  w.__scriptDone = true

  const root = w.document.querySelector('#root')
  console.log('Sau khi mount, #root có', root.children.length, 'phần tử')

  // Tìm đúng ô DropZone "File Video chính": phần tử có onClick (con trỏ pointer)
  // chứa text label; lấy phần tử sâu nhất (lá) để click đúng handler.
  const all = [...w.document.querySelectorAll('div')].filter((d) => d.textContent.includes('File Video chính'))
  const dz = all[all.length - 1]
  if (!dz) { console.log('  ❌ Không tìm thấy DropZone'); process.exit(1) }
  console.log('  → tìm thấy', all.length, 'div chứa label, click phần tử sâu nhất')
  dz.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }))
  console.log('  ✓ Đã click DropZone File Video chính')

  await new Promise((r) => setTimeout(r, 2500)) // chờ fetch file dialog mô phỏng + probe

  const after = w.document.querySelector('#root')
  const fullText = after ? after.textContent.replace(/\s+/g, ' ') : ''
  console.log('Sau khi chọn file, #root có', after ? after.children.length : -1, 'phần tử')
  console.log('Body text:', JSON.stringify(fullText.slice(0, 500)))
  if (!after || after.children.length === 0) {
    console.log('\n❌ TÁI HIỆN THÀNH CÔNG: giao diện đã biến mất (React unmount toàn bộ)')
    console.log('   → lỗi xuất hiện ở dòng "WINDOW ERROR" phía trên (nếu có)')
    process.exit(2)
  }
  const hasLog = /Đang phân tích|sample.*640|Console Log/.test(fullText)
  const hasTime = /\d{2}:\d{2}:\d{2}/.test(fullText)
  console.log('Log đã render:', hasLog, '| timestamp đã render:', hasTime)
  if (hasLog && hasTime) console.log('\n✅ Không crash — giao diện + log hiển thị đúng')
  else { console.log('\n⚠ Không crash nhưng chưa thấy log/time — kiểm tra lại'); process.exit(3) }
  process.exit(0)
}

main().catch((e) => { console.error('repro main error:', e); process.exit(1) })