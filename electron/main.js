'use strict'

/**
 * main.js — Electron Main Process
 * Khởi tạo cửa sổ, khai báo toàn bộ IPC, điều phối tới Core Engine.
 */
const { app, BrowserWindow, ipcMain, dialog, shell, screen } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const engine = require('./ffmpegEngine')
const { checkBinaries, ffmpegPath, resolveBin } = require('./paths')

let mainWindow = null

// Kích thước cửa sổ (DIP) — chiều CAO sẽ được renderer canh lại cho vừa khít Cột 1
const WIN_DEFAULT_W = 1600
const WIN_DEFAULT_H = 900
const WIN_MIN_W = 1280
const WIN_MIN_H = 820

const DEV_URL = process.env.VITE_DEV_SERVER_URL

function createWindow() {
  mainWindow = new BrowserWindow({
    width: WIN_DEFAULT_W,
    height: WIN_DEFAULT_H,
    minWidth: WIN_MIN_W,
    minHeight: WIN_MIN_H,
    title: 'Kull Aegisub Renderer',
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'icon.ico')
      : path.join(__dirname, 'icon.ico'),
    backgroundColor: '#0b0f19',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Dev (vite server, origin http://) cần tải media từ file:// → tắt webSecurity.
      // Bản build thường load từ file:// (cùng origin) → giữ true như mặc định.
      webSecurity: !DEV_URL,
    },
  })

  if (DEV_URL) {
    mainWindow.loadURL(DEV_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    engine.cancelRender()
    mainWindow = null
  })
}

// ─── IPC: Probe & hiển thị thông tin ─────────────────────────
ipcMain.handle('probe-media', (_e, filePath, lang) => engine.probeMedia(filePath, lang))

ipcMain.handle('select-file', async (_e, opts) => {
  const lang = opts?.lang === 'en' ? 'en' : 'vi'
  const res = await dialog.showOpenDialog(mainWindow, {
    title: opts?.title || (lang === 'en' ? 'Select file' : 'Chọn file'),
    filters: opts?.filters || [{ name: lang === 'en' ? 'All files' : 'Tất cả file', extensions: ['*'] }],
    properties: ['openFile'],
  })
  return res.canceled ? null : res.filePaths[0]
})

ipcMain.handle('select-dir', async (_e, lang) => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: lang === 'en' ? 'Choose output folder' : 'Chọn thư mục lưu file xuất',
    properties: ['openDirectory', 'createDirectory'],
  })
  return res.canceled ? null : res.filePaths[0]
})

ipcMain.handle('open-folder', async (_e, dirPath) => {
  if (!dirPath) return false
  return shell.openPath(dirPath)
})

// ─── IPC: Mở video + phụ đề bằng trình phát ngoài (VLC / MPV / mặc định OS) ───
// Preview ASS trong app do FFmpeg render 1 frame PNG (engine đang chọn: AviSynth +
// VSFilterMod/VSFilter, hoặc libass) rồi phủ lên video — không dùng WebGL/WASM.
// VLC/MPV dùng libass native nên xem được lúc ĐANG PHÁT, hiển thị chuẩn 100% như
// bản render thật. Trả về { ok, player } — player: 'VLC' | 'MPV' | 'default' | null.
ipcMain.handle('open-in-player', async (_e, videoPath, subPath) => {
  if (!videoPath || !fs.existsSync(videoPath)) return { ok: false, player: null }
  try {
    const isWin = process.platform === 'win32'
    const localAppData = process.env.LOCALAPPDATA || ''
    const vlcCandidates = isWin
      ? [
          path.join(process.env.PROGRAMFILES || '', 'VideoLAN', 'VLC', 'vlc.exe'),
          path.join(process.env['PROGRAMFILES(X86)'] || '', 'VideoLAN', 'VLC', 'vlc.exe'),
          path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'vlc.exe'),
        ]
      : [
          '/Applications/VLC.app/Contents/MacOS/VLC',
          '/opt/homebrew/bin/vlc', '/usr/local/bin/vlc', '/usr/bin/vlc', '/snap/bin/vlc',
        ]
    const mpvCandidates = isWin
      ? [
          path.join(process.env.PROGRAMFILES || '', 'mpv', 'mpv.exe'),
          path.join(process.env['PROGRAMFILES(X86)'] || '', 'mpv', 'mpv.exe'),
          path.join(localAppData, 'mpv', 'mpv.exe'),
          path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'mpv.exe'),
        ]
      : [
          '/Applications/mpv.app/Contents/MacOS/mpv',
          '/opt/homebrew/bin/mpv', '/usr/local/bin/mpv', '/usr/bin/mpv',
        ]

    const vlc = vlcCandidates.find((p) => p && fs.existsSync(p))
    const mpv = vlc ? null : mpvCandidates.find((p) => p && fs.existsSync(p))
    const player = vlc || mpv

    if (player) {
      const args = []
      // Nạp kèm file phụ đề — cả VLC lẫn MPV đều nhận --sub-file
      if (subPath && fs.existsSync(subPath)) args.push(`--sub-file=${subPath}`)
      args.push(videoPath)
      const child = spawn(player, args, { detached: true, stdio: 'ignore' })
      child.on('error', (err) => console.warn('open-in-player spawn error:', err.message))
      child.unref()
      return { ok: true, player: vlc ? 'VLC' : 'MPV' }
    }

    // Không tìm thấy VLC/MPV → mở bằng trình phát mặc định của hệ điều hành
    await shell.openPath(videoPath)
    return { ok: true, player: 'default' }
  } catch (err) {
    console.warn('open-in-player failed:', err)
    return { ok: false, player: null }
  }
})

ipcMain.handle('check-bin', () => checkBinaries())

ipcMain.handle('get-encoders', () => engine.detectEncoders())

ipcMain.handle('get-app-version', () => app.getVersion())

// ─── IPC: Render ─────────────────────────────────────────────
ipcMain.handle('render:start', async (_e, options) => {
  if (!mainWindow) return
  const send = (channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
  }
  await engine.startRender(options, {
    onProgress: (p) => send('render:progress', p),
    onLog: (line, level = 'info') => send('render:log', { line, level }),
    onDone: (d) => send('render:done', d),
    onError: (e) => send('render:error', e),
  })
})

ipcMain.handle('render:cancel', () => {
  engine.cancelRender()
})

// ─── IPC: Trim A→B (xuất clip riêng) ─────────────────────────
ipcMain.handle('trim:start', async (_e, options) => {
  if (!mainWindow) return
  const send = (channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
  }
  await engine.exportTrimClip(options, {
    onProgress: (p) => send('render:progress', p),
    onLog: (line, level = 'info') => send('render:log', { line, level }),
    onDone: (d) => send('render:done', d),
    onError: (e) => send('render:error', e),
  })
})

// ─── IPC: Thumbnail timeline cho Trim ────────────────────────
ipcMain.handle('trim:thumbs', async (_e, videoPath) => engine.extractThumbs(videoPath))
ipcMain.handle('trim:cleanup-thumbs', (_e, dir) => engine.cleanupThumbs(dir))

// ─── IPC: đọc file phụ đề (cho preview .ass live) ────────────
// Hỗ trợ tự động nhận diện UTF-8 (có/không BOM) và UTF-16 LE/BE (Aegisub Windows hay lưu UTF-16)
ipcMain.handle('read-file-text', (_e, filePath) => {
  try {
    const buf = fs.readFileSync(filePath)
    if (!buf || buf.length === 0) return ''
    // UTF-8 BOM (EF BB BF)
    if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
      return buf.subarray(3).toString('utf8')
    }
    // UTF-16 LE BOM (FF FE)
    if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
      return buf.subarray(2).toString('utf16le')
    }
    // UTF-16 BE BOM (FE FF)
    if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
      const swapped = Buffer.alloc(buf.length - 2)
      for (let i = 2; i < buf.length - 1; i += 2) {
        swapped[i - 2] = buf[i + 1]
        swapped[i - 1] = buf[i]
      }
      return swapped.toString('utf16le')
    }
    // Heuristic UTF-16 LE không BOM: byte chẵn là 0x00
    if (buf.length >= 4 && buf[1] === 0x00 && buf[3] === 0x00) {
      return buf.toString('utf16le')
    }
    return buf.toString('utf8')
  } catch (e) {
    return null
  }
})

// ─── IPC: Render 1 frame phụ đề cho preview ─────────────────────────────────
// Trả về data URL PNG. CÁCH render phụ thuộc engine người dùng chọn:
//  • vsfiltermod / vsfilter → AviSynth + VSFilterMod.dll (TextSubMod) / VSFilter.dll
//    (TextSub) ⇒ preview khớp CHÍNH XÁC bản render (hiệu ứng \t, \move, karaoke…).
//    Khởi tạo DirectShowSource tốn ~2s/frame nhưng đúng engine.
//  • libass (hoặc AviSynth lỗi/thiếu plugin) → -vf subtitles + setpts.
// Nhiều request song song được (file output theo seq) — renderer tự bỏ kết quả cũ khi seek.
let previewFrameSeq = 0
const previewFpsCache = new Map() // "path|size|mtime" → fps (DirectShowSource cần fps)

async function previewVideoFps(videoPath) {
  try {
    const st = fs.statSync(videoPath)
    const key = `${videoPath}|${st.size}|${st.mtimeMs}`
    if (previewFpsCache.has(key)) return previewFpsCache.get(key)
    const m = await engine.probeMedia(videoPath)
    const fps = Number(m?.fps) > 0 ? Number(m.fps) : 0
    if (previewFpsCache.size > 8) previewFpsCache.clear()
    previewFpsCache.set(key, fps)
    return fps
  } catch (e) {
    return 0
  }
}

// Tiến trình preview-frame đang chạy. Renderer báo 'preview-cancel' khi bắt đầu
// render để ta HỦY ffmpeg preview còn treo — nếu không, frame AviSynth+VSFilterMod
// vẫn cắm CPU thêm vài giây đúng lúc render cần hết tài nguyên (file .ass nặng).
let previewChild = null
let previewChildSeq = 0

function cancelPreviewFrame() {
  if (!previewChild) return
  try { previewChild.kill() } catch (e) {}
  previewChild = null
}

/** Chạy ffmpeg xuất 1 frame → resolve khi exit 0, reject khi lỗi/timeout */
function runPreviewFrame(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(ffmpegPath, args, { windowsHide: true })
    } catch (err) {
      return reject(err)
    }
    // Giữ tham chiếu để ipc 'preview-cancel' hủy được tiến trình đang treo.
    previewChild = child
    previewChildSeq = previewFrameSeq
    const done = (fn, arg) => {
      clearTimeout(timer)
      if (previewChildSeq === previewFrameSeq && previewChild === child) previewChild = null
      fn(arg)
    }
    const timer = setTimeout(() => {
      try { child.kill() } catch (e) {}
      done(reject, new Error('preview-frame timeout'))
    }, timeoutMs)
    child.on('error', (err) => done(reject, err))
    child.on('close', (code) => {
      if (code === 0) done(resolve)
      else done(reject, new Error('ffmpeg exit ' + code))
    })
  })
}

ipcMain.handle('preview-frame', async (_e, opts) => {
  const videoPath = opts?.videoPath
  const subPath = opts?.subPath
  const timeSec = Math.max(0, Number(opts?.timeSec) || 0)
  const engineName = opts?.engine === 'vsfilter' ? 'vsfilter' : opts?.engine === 'vsfiltermod' ? 'vsfiltermod' : 'libass'
  if (!videoPath || !fs.existsSync(videoPath)) return { ok: false, error: 'no-video' }
  if (!subPath || !fs.existsSync(subPath)) return { ok: false, error: 'no-sub' }
  const seq = ++previewFrameSeq
  const outDir = path.join(app.getPath('temp'), 'kull-preview-frame')
  const outFile = path.join(outDir, `frame-${process.pid}-${seq}.png`)
  let avsPath = null
  try {
    fs.mkdirSync(outDir, { recursive: true })
    const t = timeSec.toFixed(3)

    // 1) AviSynth + VSFilter* (đúng engine đang chọn) — timestamp do script tự sinh
    //    theo số frame nên KHÔNG cần bù setpts như libass.
    if (engineName !== 'libass') {
      const dllName = engineName === 'vsfilter' ? 'VSFilter.dll' : 'VSFilterMod.dll'
      const dll = resolveBin(dllName)
      if (dll) {
        const fps = await previewVideoFps(videoPath)
        try {
          avsPath = engine.createAvsScript(videoPath, subPath, dll, { fps: fps || 23.976 })
          await runPreviewFrame(
            ['-y', '-v', 'error', '-ss', t, '-i', avsPath, '-frames:v', '1', '-an', outFile],
            30000
          )
          const b64 = fs.readFileSync(outFile).toString('base64')
          return {
            ok: true,
            dataUrl: `data:image/png;base64,${b64}`,
            timeSec,
            engine: engineName,
            fn: engine.avsSubFnName(dll),
          }
        } catch (e) {
          // AviSynth/VSFilter lỗi (thiếu core, DLL hỏng…) → thử tiếp bằng libass bên dưới
        }
      }
    }

    // 2) libass — -ss trước -i làm ffmpeg dịch timestamp về 0 → PHẢI cộng lại T trước khi
    //    đưa vào subtitles filter (nếu không libass nghĩ đang ở giây 0 → không vẽ cue nào).
    const filter = `subtitles='${engine.escapeFilterPath(subPath)}'`
    await runPreviewFrame(
      [
        '-y', '-v', 'error',
        '-ss', t,
        '-i', videoPath,
        '-frames:v', '1',
        '-vf', `setpts=PTS+${t}/TB,${filter}`,
        '-an', outFile,
      ],
      15000
    )
    const b64 = fs.readFileSync(outFile).toString('base64')
    return { ok: true, dataUrl: `data:image/png;base64,${b64}`, timeSec, engine: 'libass' }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  } finally {
    try { fs.unlinkSync(outFile) } catch (e) {}
    if (avsPath) { try { fs.unlinkSync(avsPath) } catch (e) {} }
  }
})

// Hủy ffmpeg preview-frame đang chạy (renderer gọi khi bắt đầu render).
// Tăng seq để response đang dở không còn ai đọc nữa.
ipcMain.on('preview-cancel', () => {
  previewFrameSeq++
  cancelPreviewFrame()
})

// ─── IPC: tự canh chiều cao cửa sổ cho VỪA KHÍT nội dung Cột 1 ─
// Renderer đo chiều cao thật của nội dung Cột 1 rồi gửi `delta` (px):
// delta > 0 → nội dung cao hơn khung nhìn (Cột 1 phải cuộn) → nới cửa sổ;
// delta < 0 → còn dư chỗ → thu cửa sổ lại cho vừa khít.
// Luôn giữ: bề ngang không đổi, chiều cao ≥ WIN_MIN_H và ≤ vùng làm việc của màn hình.
ipcMain.handle('fit-window-height', (_e, delta) => {
  if (!mainWindow || mainWindow.isDestroyed()) return null
  const d = Math.round(Number(delta) || 0)
  const b = mainWindow.getBounds()
  if (!d) return b.height
  const wa = screen.getDisplayMatching(b).workArea
  const maxH = Math.max(WIN_MIN_H, wa.y + wa.height - Math.max(b.y, wa.y))
  const target = Math.min(maxH, Math.max(WIN_MIN_H, b.height + d))
  if (Math.abs(target - b.height) < 2) return b.height // lệch < 2px → bỏ qua (khỏi rung cửa sổ)
  const wasResizable = mainWindow.isResizable()
  if (!wasResizable) mainWindow.setResizable(true) // Windows: cần cho phép đổi kích thước
  mainWindow.setBounds({ x: b.x, y: b.y, width: b.width, height: target })
  if (!wasResizable) mainWindow.setResizable(false)
  return target
})

// ─── Khởi động app ───────────────────────────────────────────
app.whenReady().then(() => {
  // Dọn file .avs tạm sót lại từ phiên trước (render bị kill đột ngột)
  try {
    const n = engine.cleanupStaleAvs()
    if (n > 0) console.log(`[cleanup] Đã dọn ${n} file .avs tạm sót lại trong %TEMP%`)
  } catch (e) {}
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})