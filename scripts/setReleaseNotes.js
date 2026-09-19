/**
 * setReleaseNotes.js — ghi nội dung (body) cho một Release trên GitHub, đảm bảo UTF-8 đúng chuẩn.
 *
 * ⚠️ VÌ SAO CẦN SCRIPT NÀY:
 *   PowerShell 5 đọc file .ps1 KHÔNG có BOM theo bảng mã ANSI (CP1252), nên mọi ký tự
 *   tiếng Việt trong here-string bị hỏng NGAY TRƯỚC KHI gửi lên GitHub — kết quả là
 *   release hiển thị dạng "ghĂ©p cá»©ng phá»¥ Ä‘á»" (mojibake).
 *   Node đọc/ghi UTF-8 chuẩn nên tránh được hoàn toàn lỗi này.
 *
 * Cách dùng:
 *   node scripts/setReleaseNotes.js <file-notes.md> <tag> [owner/repo] [token]
 *
 * Ví dụ:
 *   node scripts/setReleaseNotes.js docs/release-v1.1.0.md v1.1.0
 *
 * Token: lấy từ tham số thứ 4 hoặc biến môi trường GITHUB_TOKEN.
 * PowerShell: (git credential fill ... ).password  →  $env:GITHUB_TOKEN
 *
 * Script TỰ KIỂM CHỨNG: sau khi PATCH sẽ GET lại và so hash với file gốc.
 * Nếu không khớp hoặc còn chuỗi mojibake → exit code 1.
 */
'use strict'

const https = require('https')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const notesFile = process.argv[2]
const tag = process.argv[3]
const repo = process.argv[4] || 'zingky/kull-aegisub-renderer'
const token = process.argv[5] || process.env.GITHUB_TOKEN

function die(msg) { console.error('[setReleaseNotes] ' + msg); process.exit(1) }

if (!notesFile) die('thiếu đường dẫn file notes (.md)')
if (!tag) die('thiếu tag (VD: v1.0.0)')
if (!token) die('thiếu token (GITHUB_TOKEN) — lấy bằng: git credential fill')

function api(apiPath, method = 'GET', payload = null) {
  return new Promise((resolve, reject) => {
    const data = payload ? Buffer.from(JSON.stringify(payload), 'utf8') : null
    const req = https.request({
      hostname: 'api.github.com',
      path: apiPath,
      method,
      headers: {
        Authorization: 'token ' + token,
        'User-Agent': 'kull-release',
        Accept: 'application/vnd.github+json',
        ...(data ? { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length } : {}),
      },
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        if (res.statusCode >= 400) return reject(new Error(res.statusCode + ' ' + text.slice(0, 300)))
        resolve(text ? JSON.parse(text) : null)
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

/** chuẩn hoá để so sánh: bỏ CRLF, bỏ dòng trống cuối */
const norm = (s) => s.replace(/\r\n/g, '\n').replace(/\n+$/, '')
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16)

/** dấu hiệu mojibake tiếng Việt: UTF-8 bị đọc nhầm thành CP1252 rồi encode lại */
const MOJIBAKE = /Ă©|Ă¡|Ä‚|Ă¢|Ă„|á»|áº|Ă´|Æ°/

;(async () => {
  const p = path.resolve(notesFile)
  if (!fs.existsSync(p)) die('không thấy file: ' + p)

  const body = norm(fs.readFileSync(p, 'utf8'))
  if (MOJIBAKE.test(body)) {
    console.warn('[cảnh báo] file notes đã chứa chuỗi mojibake — nội dung sẽ lên GitHub y như vậy!')
  }
  console.log('file notes  :', p)
  console.log('chars/bytes :', body.length, '/', Buffer.byteLength(body, 'utf8'))
  console.log('sha(gốc)    :', sha(body))

  const rel = await api(`/repos/${repo}/releases/tags/${tag}`)
  console.log('release id  :', rel.id, '|', rel.name)

  await api(`/repos/${repo}/releases/${rel.id}`, 'PATCH', { body })
  console.log('-> đã ghi body')

  const after = await api(`/repos/${repo}/releases/tags/${tag}`)
  const got = norm(after.body)
  const ok = sha(got) === sha(body) && !MOJIBAKE.test(got)
  console.log('sha(kiểm lại):', sha(got))
  console.log('kết quả     :', ok ? 'OK — UTF-8 khớp hoàn toàn' : 'SAI — nội dung không khớp / còn mojibake')
  console.log('assets      :', after.assets.map((a) => `${a.name} (${(a.size / 1048576).toFixed(1)} MB, ${a.state})`).join(', '))
  if (!ok) process.exit(1)
})().catch((e) => die(e.message))