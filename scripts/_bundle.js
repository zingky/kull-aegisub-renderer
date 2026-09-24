/**
 * _bundle.js — Chọn ĐÚNG entry bundle trong `dist/assets`.
 *
 * Từ v2.0 Vite có code-splitting (JASSUB worker/fonts/wasm) nên `dist/assets` chứa nhiều `.js`.
 * `readdirSync(...).find(f => f.endsWith('.js'))` sẽ trả về chunk đầu theo alphabet (fonts-/jassub-)
 * → test đọc nhầm chunk, không thấy code app. Entry đúng là chunk chứa `createRoot`.
 */
const fs = require('fs')
const path = require('path')

const ASSETS_DIR = path.join(__dirname, '..', 'dist', 'assets')

function listJs() {
  return fs
    .readdirSync(ASSETS_DIR)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.map'))
    .map((f) => ({ f, src: fs.readFileSync(path.join(ASSETS_DIR, f), 'utf8') }))
}

/** @returns {{f: string, src: string}} entry chunk (chứa createRoot) */
function entryBundle() {
  const js = listJs()
  const hit = js.find((x) => x.src.includes('createRoot'))
  if (!hit) {
    throw new Error(
      `Không tìm thấy entry bundle (chunk chứa "createRoot") trong ${ASSETS_DIR}.\n` +
        `Chạy \`npm run build\` trước. Các .js hiện có: ${js.map((x) => x.f).join(', ') || '(trống)'}`
    )
  }
  return hit
}

/** @returns {string} CSS bundle chính (index-*.css) */
function mainCss() {
  const f = fs.readdirSync(ASSETS_DIR).find((x) => x.endsWith('.css') && x.startsWith('index-'))
  if (!f) throw new Error(`Không tìm thấy index-*.css trong ${ASSETS_DIR}`)
  return fs.readFileSync(path.join(ASSETS_DIR, f), 'utf8')
}

/**
 * @returns {string} Source bundle đã chuyển sang dạng chạy được bằng `w.eval()` trong jsdom.
 * - `import.meta.url` → thay bằng URL tĩnh (jsdom/classic script không hiểu import.meta)
 * - bỏ `export{...};` (re-export Rollup tạo cho chunk JASSUB) vì classic script không hiểu ESM
 */
function runnableBundle() {
  return entryBundle()
    .src.replace(/import\.meta\.url/g, '"file:///repo/dist/"')
    .replace(/export\s*\{[^}]*\}\s*;?/g, '')
}

module.exports = { ASSETS_DIR, entryBundle, mainCss, runnableBundle }
