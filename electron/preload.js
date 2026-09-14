'use strict'

/**
 * preload.js — Cầu nối an toàn giữa Renderer (React) và Main Process
 * Phơi bày window.renderAPI cho UI.
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron')

function bind(channel, cb) {
  const listener = (_e, payload) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('renderAPI', {
  // Lấy đường dẫn tuyệt đối của File kéo-thả (Electron >= 29 không còn file.path)
  getPathForFile: (file) => webUtils.getPathForFile(file),

  // IPC: probe đọc thông số media
  probeMedia: (filePath) => ipcRenderer.invoke('probe-media', filePath),

  // IPC: hộp thoại chọn file / chọn thư mục
  selectFile: (opts) => ipcRenderer.invoke('select-file', opts),
  selectDir: () => ipcRenderer.invoke('select-dir'),

  // IPC: render / hủy / mở thư mục / kiểm tra bin
  startRender: (options) => ipcRenderer.invoke('render:start', options),
  cancelRender: () => ipcRenderer.invoke('render:cancel'),
  openFolder: (dirPath) => ipcRenderer.invoke('open-folder', dirPath),
  checkBin: () => ipcRenderer.invoke('check-bin'),
  getEncoders: () => ipcRenderer.invoke('get-encoders'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Sự kiện đẩy từ Main Process về UI
  onProgress: (cb) => bind('render:progress', cb),
  onLog: (cb) => bind('render:log', cb),
  onDone: (cb) => bind('render:done', cb),
  onError: (cb) => bind('render:error', cb),
})