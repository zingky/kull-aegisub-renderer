'use strict'

/**
 * main.js — Electron Main Process
 * Khởi tạo cửa sổ, khai báo toàn bộ IPC, điều phối tới Core Engine.
 */
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const engine = require('./ffmpegEngine')
const { checkBinaries } = require('./paths')

let mainWindow = null

const DEV_URL = process.env.VITE_DEV_SERVER_URL

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 860,
    minWidth: 1100,
    minHeight: 800,
    title: 'Kull Aegisub Renderer',
    backgroundColor: '#0b0f19',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
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

// ─── Khởi động app ───────────────────────────────────────────
app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})