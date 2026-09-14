'use strict'
/**
 * checkRows.js — kiểm tra layout mục 2: thứ tự & xuống dòng các nút radio.
 * Render bundle production trong jsdom, đo vị trí Y (offsetTop) của từng
 * nút để xác nhận: cặp VSFilter cùng dòng, libass dòng riêng, NVENC+AMD
 * cùng dòng, QSV+CPU cùng dòng, Tự động dòng riêng cuối cùng.
 */
const { JSDOM, VirtualConsole } = require('jsdom')
const fs = require('fs')
const path = require('path')

const assetsDir = path.join(__dirname, '..', 'dist', 'assets')
const jsBundle = fs.readdirSync(assetsDir).find((f) => f.endsWith('.js') && !f.endsWith('.map'))
const bundleSrc = fs.readFileSync(path.join(assetsDir, jsBundle), 'utf8')
console.log('Bundle:', jsBundle)

const vc = new VirtualConsole()
vc.on('error', () => {})
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  url: 'file:///repo/index.html',
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
  getEncoders: async () => ['cpu', 'nvenc', 'qsv', 'amf'],
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

async function main() {
  w.eval(bundleSrc)
  await new Promise((r) => setTimeout(r, 800))

  // Tìm label chứa text chính xác (tránh div tổ tiên cũng chứa text)
  const labels = [...w.document.querySelectorAll('label')]
  const find = (t) => labels.find((l) => l.textContent.replace(/\s+/g, ' ').includes(t))
  const names = ['VSFilterMod.dll', 'VSFilter.dll', 'libass', 'NVIDIA NVENC', 'AMD AMF',
    'Intel QSV', 'CPU (x264/x265)', 'Tự động']
  // jsdom không layout CSS grid (mọi getBoundingClientRect đều 0).
  // Kiểm tra cấu trúc DOM thay thế: nút nào nằm chung div.grid cha,
  // và thứ tự các khối theo đúng yêu cầu (6 khối: VSFilter×2, libass,
  // NVENC+AMD, QSV+CPU, Tự động — libass & Tự động là label full-width,
  // không bọc div.grid riêng).
  const sec2 = w.document.querySelector('#sec2')
  const grids = [...sec2.querySelectorAll(':scope div.grid')]
  const soloLabels = [...sec2.querySelectorAll(':scope > div > div > label')].filter((l) => !l.closest('div.grid'))
  const txt = (el) => el.textContent.replace(/\s+/g, ' ')
  console.log(`Tìm thấy ${grids.length} khối grid + ${soloLabels.length} label full-width trong mục 2:`)
  grids.forEach((g, i) => console.log(`  grid ${i + 1} (${g.className.match(/grid-cols-\d/)?.[0]}): ${txt(g).slice(0, 80)}`))
  soloLabels.forEach((l, i) => console.log(`  solo ${i + 1}: ${txt(l).slice(0, 80)}`))

  const has = (el, t) => txt(el).includes(t)
  let fail = 0
  const check = (cond, msg) => {
    console.log(`  ${cond ? '✓' : '❌'} ${msg}`)
    if (!cond) fail++
  }
  check(grids.length === 3, 'đúng 3 khối grid 2 cột (VSFilter / NVENC+AMD / QSV+CPU)')
  if (grids.length === 3) {
    check(has(grids[0], 'VSFilterMod.dll') && has(grids[0], 'VSFilter.dll'), 'dòng 1: VSFilterMod + VSFilter cùng dòng')
    check(has(grids[1], 'NVIDIA NVENC') && has(grids[1], 'AMD AMF'), 'dòng 3: NVIDIA + AMD cùng dòng')
    check(has(grids[2], 'Intel QSV') && has(grids[2], 'CPU (x264/x265)'), 'dòng 4: Intel + CPU cùng dòng')
  }
  check(soloLabels.length === 2, 'đúng 2 label full-width (libass + Tự động)')
  if (soloLabels.length === 2) {
    check(has(soloLabels[0], 'libass'), 'dòng 2: libass riêng 1 dòng (sau cặp VSFilter)')
    check(has(soloLabels[1], 'Tự động'), 'dòng 5: Tự động riêng dòng cuối')
  }
  // Thứ tự dọc trong DOM: engine trước, hardware sau
  const bodyTxt = w.document.querySelector('#root').textContent.replace(/\s+/g, ' ')
  const pos = ['VSFilterMod.dll', 'libass', 'NVIDIA NVENC', 'Intel QSV', 'Tự động'].map((n) => bodyTxt.indexOf(n))
  check(pos.every((p, i) => p >= 0 && (i === 0 || p > pos[i - 1])), 'thứ tự từ trên xuống: VSFilter → libass → NVENC → Intel → Tự động')
  if (fail) { console.log(`\n❌ LAYOUT SAI (${fail} kiểm tra)`); process.exit(1) }
  console.log('\n✅ LAYOUT MỤC 2 ĐÚNG YÊU CẦU')
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
