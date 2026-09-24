#!/usr/bin/env node
'use strict'
/**
 * createRelease.js — tạo GitHub Release + upload asset, an toàn UTF-8 (không dùng PowerShell).
 *
 * Dùng:
 *   node scripts/createRelease.js <tag> <file-notes.md> <file1> [file2] ... -- [owner/repo]
 * Ví dụ:
 *   node scripts/createRelease.js v2.0.0 docs/release-notes-v2.0.0.md \
 *        release/KullAegisubRenderer-2.0.0-win-x64.zip release/KullAegisubRenderer-2.0.0-portable.exe
 *
 * Token: đọc từ env GITHUB_TOKEN (khuyến nghị) hoặc từ file ở env GITHUB_TOKEN_FILE.
 * Script TỰ KIỂM CHỨNG sau khi xong: GET lại release, so hash nội dung body với file notes,
 * và kiểm tra từng asset đã ở trạng thái `uploaded` + đủ dung lượng.
 */
const fs = require('fs')
const path = require('path')
const https = require('https')
const crypto = require('crypto')

const argv = process.argv.slice(2)
const sep = argv.indexOf('--')
const repoArg = sep >= 0 ? argv[sep + 1] : null
const main = sep >= 0 ? argv.slice(0, sep) : argv
const [tag, notesFile, ...assets] = main

function die(msg) { console.error('❌', msg); process.exit(1) }

if (!tag || !notesFile) {
  die('thiếu tham số.\n  node scripts/createRelease.js <tag> <notes.md> <asset...> [-- owner/repo]')
}
if (!fs.existsSync(notesFile)) die(`không thấy file notes: ${notesFile}`)
for (const a of assets) if (!fs.existsSync(a)) die(`không thấy asset: ${a}`)

const repo = repoArg || 'zingky/kull-aegisub-renderer'
let token = process.env.GITHUB_TOKEN || ''
if (!token && process.env.GITHUB_TOKEN_FILE && fs.existsSync(process.env.GITHUB_TOKEN_FILE)) {
  token = fs.readFileSync(process.env.GITHUB_TOKEN_FILE, 'utf8').trim()
}
if (!token) die('thiếu token (đặt env GITHUB_TOKEN hoặc GITHUB_TOKEN_FILE)')

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const notesRaw = fs.readFileSync(notesFile, 'utf8')
const notes = notesRaw.replace(/\r\n/g, '\n').trim() + '\n'
const title = `${tag} — Kull Aegisub Renderer`
console.log(`Repo   : ${repo}`)
console.log(`Tag    : ${tag}`)
console.log(`Tiêu đề: ${title}`)
console.log(`Notes  : ${notesFile} (${notes.length} ký tự, sha256 ${sha256(notes).slice(0, 16)})`)
console.log(`Assets : ${assets.map((a) => path.basename(a)).join(', ') || '(không có)'}`)

/** Gọi REST API GitHub, trả JSON đã parse */
function api(pathOrUrl, { method = 'GET', body, raw = false, headers = {} } = {}) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `https://api.github.com${pathOrUrl}`
  const data = body ? Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8') : null
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method,
      headers: {
        'User-Agent': 'kull-aegisub-renderer-release',
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github+json',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}),
        ...headers,
      },
    }, (res) => {
      let out = ''
      res.on('data', (c) => { out += c })
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(raw ? out : (out ? JSON.parse(out) : {}))
        } else {
          reject(new Error(`HTTP ${res.statusCode} ${method} ${url}\n${String(out).slice(0, 500)}`))
        }
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

/** Upload 1 file bằng stream (asset lớn ~200MB không nạp hết vào RAM) */
function uploadAsset(uploadUrl, file) {
  const size = fs.statSync(file).size
  const name = path.basename(file)
  const url = `${uploadUrl}?name=${encodeURIComponent(name)}`
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'kull-aegisub-renderer-release',
        Authorization: `token ${token}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': size,
      },
    }, (res) => {
      let out = ''
      res.on('data', (c) => { out += c })
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(out))
        else reject(new Error(`HTTP ${res.statusCode} upload ${name}\n${String(out).slice(0, 500)}`))
      })
    })
    req.on('error', reject)
    const rs = fs.createReadStream(file)
    rs.on('error', reject)
    let sent = 0
    rs.on('data', (c) => {
      sent += c.length
      if (sent % (20 * 1024 * 1024) < c.length) {
        process.stdout.write(`\r     ${name}: ${Math.round((sent / size) * 100)}%   `)
      }
    })
    rs.pipe(req)
    rs.on('end', () => process.stdout.write(`\r     ${name}: 100%          \n`))
  })
}

async function mainRun() {
  // 1. Release đã tồn tại thì dùng lại, chưa có thì tạo
  let rel
  try {
    rel = await api(`/repos/${repo}/releases/tags/${tag}`)
    console.log(`\n[1] Release ${tag} đã tồn tại (id=${rel.id}) → cập nhật tên + nội dung`)
    rel = await api(`/repos/${repo}/releases/${rel.id}`, {
      method: 'PATCH', body: { name: title, body: notes },
    })
  } catch {
    console.log(`\n[1] Tạo release mới ${tag}`)
    rel = await api(`/repos/${repo}/releases`, {
      method: 'POST',
      body: { tag_name: tag, target_commitish: 'main', name: title, body: notes, draft: false, prerelease: false },
    })
  }
  console.log(`     → ${rel.html_url}`)

  // 2. Xoá asset trùng tên rồi upload bản mới
  if (assets.length) {
    const existing = await api(`/repos/${repo}/releases/${rel.id}/assets`)
    for (const a of assets) {
      const name = path.basename(a)
      const dup = existing.find((x) => x.name === name)
      if (dup) {
        console.log(`[2] Xoá asset cũ trùng tên: ${name} (id=${dup.id})`)
        await api(`/repos/${repo}/releases/assets/${dup.id}`, { method: 'DELETE' })
      }
    }
    for (const a of assets) {
      const name = path.basename(a)
      console.log(`[2] Upload ${name} (${(fs.statSync(a).size / 1048576).toFixed(1)} MB)...`)
      await uploadAsset(rel.upload_url.replace('{?name,label}', ''), a)
    }
  }

  // 3. TỰ KIỂM CHỨNG: body khớp file notes + asset đã uploaded
  await new Promise((r) => setTimeout(r, 3000))
  const check = await api(`/repos/${repo}/releases/tags/${tag}`)
  const gotBody = String(check.body || '').replace(/\r\n/g, '\n').trim() + '\n'
  const bodyOk = sha256(gotBody) === sha256(notes)
  console.log(`\n[3] Kiểm chứng:`)
  console.log(`     tiêu đề : ${check.name}`)
  console.log(`     body    : ${gotBody.length} ký tự · sha khớp file gốc = ${bodyOk ? 'ĐÚNG ✅' : 'SAI ❌'}`)
  if (!bodyOk) {
    console.log('     (10 ký tự đầu trên GitHub):', JSON.stringify(gotBody.slice(0, 120)))
  }
  let assetOk = true
  for (const a of assets) {
    const name = path.basename(a)
    const size = fs.statSync(a).size
    const found = (check.assets || []).find((x) => x.name === name)
    const ok = found && found.state === 'uploaded' && found.size === size
    if (!ok) assetOk = false
    console.log(`     asset   : ${name} → ${found ? `${(found.size / 1048576).toFixed(1)} MB · state=${found.state}` : 'KHÔNG THẤY'} ${ok ? '✅' : '❌'}`)
  }
  if (!bodyOk || !assetOk) die('kiểm chứng thất bại')
  console.log(`\n✅ RELEASE ${tag} HOÀN TẤT — body UTF-8 đúng, ${assets.length} asset uploaded`)
}

mainRun().catch((e) => die(e.message))
