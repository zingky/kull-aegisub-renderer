'use strict'

/**
 * afterPackIcon.js — hook "afterPack" của electron-builder
 *
 * VÌ SAO CẦN:
 *   config đang đặt signAndEditExecutable=false để build không cần quyền Admin
 *   (electron-builder sẽ không tải gói winCodeSign chứa symlink macOS nữa).
 *   Hệ quả: builder bỏ qua bước nhúng icon vào app exe => app exe mang icon
 *   Electron mặc định (taskbar/Explorer hiển thị sai).
 *
 *   Hook này tự đóng dấu icon bằng "rcedit" (sửa PE resource thuần, KHÔNG cần Admin),
 *   chạy ngay sau bước packaging và TRƯỚC khi target portable được tạo
 *   => cả app exe lẫn file portable đều mang icon kimishinu.
 *
 * Icon lỗi chỉ cảnh báo, không làm hỏng build.
 */

const path = require('path')
const fs = require('fs')

function resolveExePath(appOutDir, packager) {
  const candidates = []
  try {
    if (packager?.appInfo?.productFilename) {
      candidates.push(path.join(appOutDir, `${packager.appInfo.productFilename}.exe`))
    }
    if (packager?.appInfo?.productName) {
      candidates.push(path.join(appOutDir, `${packager.appInfo.productName}.exe`))
    }
  } catch {
    /* bỏ qua */
  }
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c
  }
  // Dự phòng: chọn file .exe lớn nhất ở gốc appOutDir (bỏ qua elevate.exe, các helper nhỏ)
  try {
    const found = fs
      .readdirSync(appOutDir)
      .filter((f) => f.toLowerCase().endsWith('.exe'))
      .map((f) => path.join(appOutDir, f))
      .filter((p) => fs.statSync(p).isFile())
      .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)
    return found[0] || null
  } catch {
    return null
  }
}

exports.default = async function afterPackIcon(context) {
  const { appOutDir, packager } = context
  const platform = context.electronPlatformName || packager?.platform?.name

  if (platform !== 'win32') return

  const iconPath = path.join(__dirname, '..', 'build', 'icon.ico')
  if (!fs.existsSync(iconPath)) {
    console.warn('  • [icon] bỏ qua: không thấy build/icon.ico')
    return
  }

  const exePath = resolveExePath(appOutDir, packager)
  if (!exePath) {
    console.warn('  • [icon] bỏ qua: không tìm thấy app exe trong ' + appOutDir)
    return
  }

  let rcedit = require('rcedit')
  rcedit = typeof rcedit === 'function' ? rcedit : rcedit.rcedit
  if (typeof rcedit !== 'function') {
    console.warn('  • [icon] bỏ qua: không nạp được rcedit')
    return
  }

  try {
    await rcedit(exePath, { icon: iconPath })
    console.log('  • [icon] đã đóng dấu icon kimishinu vào ' + path.basename(exePath))
  } catch (err) {
    console.warn('  • [icon] đóng dấu icon thất bại (không chặn build): ' + err.message)
  }
}
