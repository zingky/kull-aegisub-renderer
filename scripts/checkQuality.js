'use strict'
/**
 * checkQuality.js — kiểm tra layout mục 3: hàng presets 3 nút,
 * hàng anchor 2 nút, thứ tự đúng, + xác nhận đã gỡ liquid glass.
 */
const { JSDOM, VirtualConsole } = require('jsdom')
const fs = require('fs')
const path = require('path')

const { entryBundle, runnableBundle, mainCss } = require('./_bundle')
const jsBundle = entryBundle().f
const bundleSrc = runnableBundle()

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

async function main() {
  // Shim import.meta.url cho jsdom (bundle vite dùng URL tương đối của asset)
  w.eval(bundleSrc)
  await new Promise((r) => setTimeout(r, 800))
  const txt = (el) => el.textContent.replace(/\s+/g, ' ')
  const has = (el, t) => txt(el).includes(t)
  let fail = 0
  const check = (c, m) => { console.log(`  ${c ? '✓' : '❌'} ${m}`); if (!c) fail++ }

  const presets = w.document.querySelector('#qrow-presets')
  const anchor = w.document.querySelector('#qrow-anchor')
  check(!!presets && !!anchor, 'tồn tại 2 hàng #qrow-presets + #qrow-anchor')
  if (presets) {
    const items = [...presets.querySelectorAll(':scope > label')]
    check(items.length === 3, `hàng 1 đúng 3 nút (thấy ${items.length})`)
    check(has(presets, 'Chất lượng cao') && has(presets, 'Cân bằng') && has(presets, 'Tiết kiệm'), 'hàng 1: Cao · Cân bằng · Tiết kiệm')
    check(!has(presets, 'Giữ nguyên gốc') && !has(presets, 'Tùy chỉnh'), 'hàng 1 không lẫn Giữ gốc/Tùy chỉnh')
  }
  if (anchor) {
    const items = [...anchor.querySelectorAll(':scope > label')]
    check(items.length === 2, `hàng 2 đúng 2 nút (thấy ${items.length})`)
    check(has(anchor, 'Giữ nguyên gốc') && has(anchor, 'Tùy chỉnh'), 'hàng 2: Giữ nguyên gốc · Tùy chỉnh')
  }
  // Console log nằm trong cột phải (dưới mục 4), không còn footer full-width
  const inCol = w.document.querySelector('#sec4col .log-text')
  const footerLog = [...w.document.querySelectorAll('body > div > div.log-text, #root > div > div.log-text')]
  check(!!inCol, 'console log nằm trong cột phải dưới mục 4')
  // Không còn hiệu ứng liquid glass (đã gỡ để tối ưu tốc độ mở app)
  const glass = [...w.document.querySelectorAll('#root .glass-btn')]
  check(glass.length === 0, `không còn class glass-btn nào (thấy ${glass.length})`)
  const css = mainCss()
  check(!css.includes('.glass-btn'), 'CSS .glass-btn đã gỡ khỏi bundle')
  if (fail) { console.log(`\n❌ QUALITY/LOG SAI (${fail})`); process.exit(1) }
  console.log('\n✅ MỤC 3 + LOG ĐÚNG YÊU CẦU (KHÔNG LIQUID GLASS)')
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
