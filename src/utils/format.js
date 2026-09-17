// utils/format.js — Hàm tiện ích xử lý đường dẫn & hiển thị số liệu

export function basename(p) {
  if (!p) return ''
  return String(p).split(/[\\/]/).pop()
}

export function dirname(p) {
  if (!p) return ''
  const parts = String(p).split(/[\\/]/)
  parts.pop()
  return parts.join('\\') || '.'
}

export function extname(p) {
  const n = basename(p)
  const i = n.lastIndexOf('.')
  return i >= 0 ? n.slice(i + 1).toLowerCase() : ''
}

export function stripExt(name) {
  name = String(name ?? '')
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(0, i) : name
}

export function withExt(name, ext) {
  ext = String(ext || '').startsWith('.') ? String(ext) : `.${ext}`
  return `${stripExt(String(name ?? '').trim() || 'output')}${ext.toLowerCase()}`
}

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let u = 0
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024
    u++
  }
  return `${v.toFixed(u === 0 ? 0 : 1)} ${units[u]}`
}

export function formatDuration(secs) {
  if (secs == null || !isFinite(secs) || secs <= 0) return '—'
  secs = Math.floor(secs)
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/** ETA dạng chữ rõ ràng: vi "1 giờ 23 phút 45 giây" · en "1 h 23 min 45 s" */
export function formatEta(secs, t) {
  if (secs == null || !isFinite(secs) || secs <= 0) return '—'
  secs = Math.round(secs)
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const T = typeof t === 'function' ? t : null
  const parts = []
  if (h > 0) parts.push(T ? T('eta.hour', { n: h }) : `${h} h`)
  if (m > 0) parts.push(T ? T('eta.min', { n: m }) : `${m} min`)
  if (s > 0 || parts.length === 0) parts.push(T ? T('eta.sec', { n: s }) : `${s} s`)
  return parts.join(' ')
}

export function formatTime(t, lang) {
  try {
    const d = t instanceof Date ? t : new Date(t)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString(lang === 'en' ? 'en-US' : 'vi-VN', { hour12: false })
  } catch {
    return ''
  }
}