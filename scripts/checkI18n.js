/**
 * checkI18n.js — kiểm tra song ngữ (Tiếng Việt / English):
 *  1. Hai từ điển trong src/i18n.js phải có ĐÚNG cùng tập khoá (không sót bản dịch).
 *  2. Nút VI/EN trên header hoạt động thật trên bundle production (jsdom):
 *     mặc định tiếng Việt → bấm EN → toàn bộ UI đổi sang tiếng Anh + lưu localStorage.
 */
'use strict'
const { JSDOM, VirtualConsole } = require('jsdom')
const fs = require('fs')
const path = require('path')

let fail = 0
const check = (cond, msg) => {
  console.log(`  ${cond ? '✓' : '❌'} ${msg}`)
  if (!cond) fail++
}

// ───────────────────────── 1. Parity khoá từ điển ─────────────────────────
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n.js'), 'utf8')
const viBlock = src.slice(src.indexOf('const vi = {'), src.indexOf('const en = {'))
const enBlock = src.slice(src.indexOf('const en = {'), src.indexOf('export const DICT'))
const extractKeys = (block) => [...block.matchAll(/'([^']+)':/g)].map((m) => m[1])
const viKeys = extractKeys(viBlock)
const enKeys = extractKeys(enBlock)
const missingEn = viKeys.filter((k) => !enKeys.includes(k))
const missingVi = enKeys.filter((k) => !viKeys.includes(k))

console.log(`\n[1] Từ điển: vi=${viKeys.length} khoá · en=${enKeys.length} khoá`)
check(viKeys.length >= 60, `đủ số khoá dịch (${viKeys.length} ≥ 60)`)
check(missingEn.length === 0, `en không thiếu khoá nào${missingEn.length ? ': ' + missingEn.join(', ') : ''}`)
check(missingVi.length === 0, `vi không thiếu khoá nào${missingVi.length ? ': ' + missingVi.join(', ') : ''}`)
check(viKeys.includes('app.name') && viKeys.includes('eta.hour') && viKeys.includes('err.retry'), 'có khoá tên app / ETA / error boundary')
check(/app\.name':\s*'Kull Aegisub Renderer'/.test(viBlock) && /app\.name':\s*'Kull Aegisub Renderer'/.test(enBlock), "tên app là 'Kull Aegisub Renderer' ở cả 2 ngôn ngữ")

// ─────────────────── 2. Nút đổi ngôn ngữ trên bundle thật ───────────────────
const assetsDir = path.join(__dirname, '..', 'dist', 'assets')
const jsBundle = fs.readdirSync(assetsDir).find((f) => f.endsWith('.js') && !f.endsWith('.map'))
const bundleSrc = fs.readFileSync(path.join(assetsDir, jsBundle), 'utf8')
console.log(`\n[2] Bundle: ${jsBundle}`)

const vc = new VirtualConsole()
vc.on('error', () => {})
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  // Dùng origin http để jsdom cấp localStorage thật (kiểm tra ghi nhớ ngôn ngữ)
  url: 'http://localhost/index.html',
  virtualConsole: vc,
})
const w = dom.window
w.renderAPI = {
  getPathForFile: (f) => f.path || '',
  probeMedia: async () => ({}),
  selectFile: async () => null,
  selectDir: async () => null,
  startRender: async () => {},
  cancelRender: () => {},
  openFolder: async () => '',
  checkBin: async () => ({ ffmpeg: true, ffprobe: true, vsfilter: true, vsfiltermod: true, avisynth: true }),
  getEncoders: async () => ['cpu'],
  getAppVersion: async () => '1.0.0-test',
  onProgress: () => () => {},
  onLog: () => () => {},
  onDone: () => () => {},
  onError: () => () => {},
}
for (const k of ['window', 'document', 'navigator', 'Node', 'HTMLElement', 'getComputedStyle',
  'XMLHttpRequest', 'CustomEvent', 'Event', 'MouseEvent', 'File', 'Blob', 'URL']) {
  if (w[k] === undefined) continue
  try { global[k] = w[k] } catch {
    try { Object.defineProperty(global, k, { value: w[k], configurable: true, writable: true }) } catch (e) {}
  }
}
global.window = w

const txt = () => w.document.querySelector('#root').textContent.replace(/\s+/g, ' ')
const findBtn = (label) => [...w.document.querySelectorAll('button')].find((b) => b.textContent.trim() === label)

async function main() {
  w.eval(bundleSrc)
  await new Promise((r) => setTimeout(r, 900))

  const vi = txt()
  check(/Kull Aegisub Renderer/.test(vi), 'header hiển thị tên app mới "Kull Aegisub Renderer"')
  check(vi.includes('File Nguồn') && vi.includes('Chất Lượng Render') && vi.includes('BẮT ĐẦU RENDER'), 'mặc định là TIẾNG VIỆT (File Nguồn / Chất Lượng Render / BẮT ĐẦU RENDER)')
  check(!!findBtn('EN') && !!findBtn('VI'), 'nút chuyển ngôn ngữ VI + EN có trên header')

  findBtn('EN').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }))
  await new Promise((r) => setTimeout(r, 400))
  const en = txt()
  check(en.includes('Source Files') && en.includes('Render Quality') && en.includes('START RENDER') && en.includes('Subtitle Engine & Hardware'),
    'bấm EN → UI đổi sang TIẾNG ANH (Source Files / Render Quality / START RENDER)')
  check(!en.includes('File Nguồn') && !en.includes('BẮT ĐẦU RENDER'), 'không còn sót chuỗi tiếng Việt cũ trên header/mục')
  check(en.includes('Console Log') && en.includes('FFmpeg stderr + system messages'), 'mục Console Log + phụ đề log dịch đúng tiếng Anh')
  check(w.localStorage.getItem('kull.lang') === 'en', "ngôn ngữ được lưu vào localStorage ('kull.lang' = en)")

  findBtn('VI').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }))
  await new Promise((r) => setTimeout(r, 400))
  const back = txt()
  check(back.includes('File Nguồn') && back.includes('BẮT ĐẦU RENDER') && !back.includes('Source Files'), 'bấm VI → quay lại TIẾNG VIỆT')
  check(w.localStorage.getItem('kull.lang') === 'vi', 'localStorage cập nhật lại = vi')

  if (fail) { console.log(`\n❌ I18N SAI (${fail} kiểm tra)`); process.exit(1) }
  console.log('\n✅ SONG NGỮ VI/EN ĐẠT YÊU CẦU')
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
