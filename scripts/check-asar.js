// check-asar.js — xác minh file exe/zip đã đóng gói ĐÚNG bản vá mới nhất
//   Vì sao cần: `npm run build` (vite) chỉ tạo dist/, KHÔNG phải file chạy được.
//   `npm run dist` mới sinh release/*.exe + *.zip. Script này mở app.asar trong
//   bản đóng gói và kiểm tra bản vá có thật sự nằm trong đó (tên hàm bị minifier
//   đổi nên kiểm tra qua khoá i18n mới + dấu vết logic frame).
'use strict'
const fs = require('fs')
const path = require('path')

// Thư mục build có thể là 'release' hoặc 'release2' (tránh file .dll bị khoá
// khi app đang mở từ win-unpacked) → cho phép truyền qua argv.
const outDir = process.argv[2] || 'release'
const asar = path.join(__dirname, '..', outDir, 'win-unpacked', 'resources', 'app.asar')
if (!fs.existsSync(asar)) { console.error(`❌ Không có app.asar trong ${outDir}/ — chưa chạy npm run dist`); process.exit(1) }

const t = fs.readFileSync(asar).toString('latin1')
// Bản vá nằm trong JS bundle dạng UTF-8. Đọc asar bằng 'latin1' (an toàn vì asar
// là file nhị phân) rồi decode lại phần text sang UTF-8 để so chuỗi tiếng Việt.
// Nếu dùng luôn latin1, byte UTF-8 của 'ế' (3 byte) không bằng 1 ký tự \u1EBF
// → regex luôn trượt → tưởng bản vá thiếu trong khi thực ra có đủ.
const tUtf8 = Buffer.from(t, 'latin1').toString('utf8')
let failed = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed++ }

console.log('\n[1] app.asar có bundle MỚI nhất (tên file có hash đổi)')
const dist = path.join(__dirname, '..', 'dist', 'assets')
const cur = fs.readdirSync(dist).filter(f => /^index-.*\.js$/.test(f))
ok(cur.length > 0, `dist có ${cur.length} bundle JS`)
ok(t.includes(cur[0]), `asar chứa ${cur[0]} (khớp dist/ vừa build)`)
const stale = fs.existsSync(asar) && t.includes('index-Dhic1V8o.js')
ok(!stale, 'không còn bundle cũ (index-Dhic1V8o.js) của bản trước')

console.log('\n[2] Bản vá "1 frame" có trong bản đóng gói')
// Tên hàm bị minifier đổi (frameStep/fpsRounded không giữ) → kiểm tra khoá i18n MỚI
ok(/pv\.frameBack/.test(t), 'khoá i18n pv.frameBack có trong asar')
ok(/pv\.frameFwd/.test(t), 'khoá i18n pv.frameFwd có trong asar')
ok(/Ti\u1EBFn 1 frame/.test(tUtf8), 'chu\u1ED9i tooltip VI "Ti\u1EBFn 1 frame" (m\u1EDBi)')
ok(/Forward 1 frame/.test(tUtf8), 'chu\u1ED9i tooltip EN "Forward 1 frame" (m\u1EDBi)')
// Logic mới: Math.round(...currentTime...) r\u1ED3i divide — d\u1EA5u v\u1EBFt to\u00E1n h\u1EC7
ok(/Math\.round\(/.test(tUtf8), 'c\u00F3 Math.round (l\u00E0m vi\u1EC7c theo ch\u1EC9 s\u1ED1 frame nguy\u00EAn)')

console.log('\n[2b] Ban va "dinh dang xuat" co trong ban dong goi')
ok(/outputFormat/.test(t), 'UI co outputFormat (duoi theo lua chon)')
ok(!/srcExt/.test(t), 'khong con srcExt (duoi khong lay tu file goc)')
ok(/_clip\$\{q\+1\}/.test(t), 'co mau ten clip \`_clip\${i+1}.\${ext}\` (duoi theo lua chon)')
ok(/clipIsWebM/.test(t), 'engine co nhanh clipIsWebM (WebM cho clip)')
ok(/isWebM/.test(t), 'engine co nhanh isWebM (WebM cho render chinh)')
ok(/libvpx-vp9/.test(t), 'engine dung libvpx-vp9 cho WebM')
ok(/libopus/.test(t), 'engine dung libopus cho WebM')

console.log('\n[2c] Tinh nang "mui ten tua theo buoc" (v2.0.3)')
ok(/pv\.stepMode/.test(t), 'khoa i18n pv.stepMode (nhan buoc tua) co trong asar')
ok(/pv\.stepModeTip/.test(t), 'khoa i18n pv.stepModeTip (tooltip) co trong asar')
ok(/pv-step-hint/.test(t), 'phan tu #pv-step-hint (nhan buoc tua) co trong asar')
console.log('\n[3] File ch\u1EA1y \u0111\u01B0\u1ED3c \u0111\u00F3ng g\u00F3i')
const rel = path.join(__dirname, '..', outDir)
const _ver = require('../package.json').version
for (const f of [`KullAegisubRenderer-${_ver}-portable.exe`, `KullAegisubRenderer-${_ver}-win-x64.zip`]) {
  const p = path.join(rel, f)
  if (!fs.existsSync(p)) { ok(false, `${f} — thi\u1EBFu`); continue }
  const st = fs.statSync(p)
  const hours = (Date.now() - st.mtimeMs) / 3600000
  ok(hours < 2, `${f} (${(st.size / 1048576).toFixed(1)} MB) m\u1EDBi ${hours.toFixed(2)} gi\u1EDD tru\u1ED1c`)
}

console.log(failed === 0 ? '\n✅ PASS' : `\n❌ FAIL (${failed})`)
process.exit(failed === 0 ? 0 : 1)