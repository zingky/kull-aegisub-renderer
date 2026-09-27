#!/usr/bin/env node
/**
 * cdpDiag.mjs — Điều khiển cửa sổ Electron qua Chrome DevTools Protocol (không cần library).
 *
 * usage: node scripts/cdpDiag.mjs <port> <waitMs> <videoPath> <subPath> [shotPng]
 *
 * 1. Kết nối page target của Electron (chạy với --remote-debugging-port=<port>)
 * 2. Đợi app sẵn sàng → dispatch CustomEvent('kull-test-load') để nạp file test
 *   (xem src/App.jsx — dev-only hook)
 * 3. Chờ <waitMs> ms, thu console/exception/log, khảo sát DOM, chụp screenshot.
 */
import fs from 'node:fs'

const [port = '9333', waitMs = '14000', video = '', sub = '', shot = '', evalExpr = ''] = process.argv.slice(2)
// An toàn: không bao giờ treo vô hạn (CDP có thể không trả lời screenshot)
setTimeout(() => { console.error('TIMEOUT 90s → force exit'); process.exit(2) }, 90000)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let targets = null
for (let i = 0; i < 60 && !targets; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  } catch (e) {
    await sleep(500)
  }
}
if (!targets) {
  console.error('Cannot reach CDP port', port)
  process.exit(1)
}
const page =
  targets.find((t) => t.type === 'page' && /^https?:\/\/127\.0\.0\.1/.test(t.url)) ||
  targets.find((t) => t.type === 'page' && /^https?:/.test(t.url)) ||
  targets.find((t) => t.type === 'page')
if (!page) {
  console.error('NO PAGE TARGET. targets =', targets.map((t) => t.type + ':' + t.url).join(', '))
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = (e) => rej(new Error('ws error: ' + e.message))
})

let seq = 0
const pending = new Map()
const events = []
ws.onmessage = (ev) => {
  const msg = JSON.parse(String(ev.data))
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) rej(new Error(msg.error.message))
    else res(msg.result)
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    events.push({
      t: 'console',
      level: msg.params.type,
      text: msg.params.args.map((a) => a.value ?? a.description ?? JSON.stringify(a)).join(' '),
    })
  } else if (msg.method === 'Runtime.exceptionThrown') {
    events.push({
      t: 'exception',
      level: 'error',
      text: msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text,
    })
  } else if (msg.method === 'Log.entryAdded') {
    events.push({ t: 'log', level: msg.params.entry.level, text: msg.params.entry.text })
  }
}
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq
    pending.set(id, { res, rej })
    ws.send(JSON.stringify({ id, method, params }))
  })

await send('Runtime.enable')
await send('Log.enable')
await send('Page.enable')

// Đợi React mount (root có con) — tối đa 30s
let ready = false
for (let i = 0; i < 60 && !ready; i++) {
  const r = await send('Runtime.evaluate', {
    expression: "!!(document.querySelector('#root') && document.querySelector('#root').children.length && window.renderAPI)",
    returnByValue: true,
  })
  ready = !!r.result.value
  if (!ready) await sleep(500)
}
console.log('app ready:', ready)
await sleep(1200) // để dev-only hook effect kịp đăng ký listener

if (video) {
  const expr = `window.dispatchEvent(new CustomEvent('kull-test-load', { detail: ${JSON.stringify(
    { video, sub }
  )} })), 'dispatched'`
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true })
  console.log('dispatch:', JSON.stringify(r.result.value ?? r.result))
}

await sleep(Number(waitMs))

// Bước bổ sung (ví dụ: seek video) rồi chờ ffmpeg render frame xong
if (evalExpr) {
  const r = await send('Runtime.evaluate', { expression: evalExpr, awaitPromise: true, returnByValue: true })
  console.log('eval →', JSON.stringify(r.result.value ?? r.result ?? null))
  await sleep(4000)
}

const inspect = `JSON.stringify({
  webgl: (()=>{try{const c=document.createElement('canvas');const g=c.getContext('webgl2')||c.getContext('webgl');return g? g.getParameter(g.RENDERER):'NONE'}catch(e){return 'ex:'+e.message}})(),
  video: (()=>{const v=document.querySelector('video'); if(!v) return null; return { rs:v.readyState, vw:v.videoWidth, vh:v.videoHeight, ct:+v.currentTime.toFixed(2), paused:v.paused, err:v.error?v.error.code:null, src:(v.currentSrc||'').slice(-60) }})(),
  canvases: [...document.querySelectorAll('canvas')].map(c=>{const s=getComputedStyle(c); return {w:c.width,h:c.height,op:s.opacity,disp:s.display,pos:s.position}}),
  imgs: [...document.querySelectorAll('img')].map(i=>({tail:decodeURIComponent(i.src.slice(-50)),nw:i.naturalWidth,op:getComputedStyle(i).opacity})),
  hasDataImg: [...document.querySelectorAll('img')].some(i => i.src.startsWith('data:image/png;base64,') && i.naturalWidth > 0),
  badges: [...document.querySelectorAll('span,button')].map(e=>e.textContent.trim()).filter(x=>x&&x.length<80&&/phụ đề|ASS|JASSUB|Lỗi|không|GPS|WebGL|render|CC|ở trên|tạm dừng/i.test(x)).slice(0,20),
  bodyText: (document.body.innerText||'').slice(0,600)
})`
const st = await send('Runtime.evaluate', { expression: inspect, returnByValue: true })
console.log('STATE:', st.result.value)

console.log('EVENTS(' + events.length + '):')
for (const e of events) console.log('  [' + e.t + '/' + e.level + '] ' + e.text)

if (shot) {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(shot, Buffer.from(s.data, 'base64'))
  console.log('screenshot →', shot)
}
ws.close()
process.exit(0)
