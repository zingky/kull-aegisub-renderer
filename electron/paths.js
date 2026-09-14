'use strict'

/**
 * paths.js — Giải quyết đường dẫn tới các file portable trong bin/
 * Hỗ trợ 2 chế độ:
 *   - Dev / chạy nguồn:  <project>/bin
 *   - Packaged (portable exe): <resources>/bin (electron-builder extraResources)
 */
const path = require('path')
const fs = require('fs')

const APP_ROOT = path.join(__dirname, '..')

function getBinDir() {
  // Ưu tiên thư mục bin trong resources khi chạy từ app đã đóng gói
  try {
    const rp = process.resourcesPath
    if (rp) {
      const p = path.join(rp, 'bin')
      if (fs.existsSync(p)) return p
    }
  } catch (e) {}
  return path.join(APP_ROOT, 'bin')
}

const BIN_DIR = getBinDir()

function resolveBin(name) {
  const p = path.join(BIN_DIR, name)
  return fs.existsSync(p) ? p : null
}

function checkBinaries() {
  return {
    binDir: BIN_DIR,
    ffmpeg: !!resolveBin('ffmpeg.exe'),
    ffprobe: !!resolveBin('ffprobe.exe'),
    vsfilter: !!resolveBin('VSFilter.dll'),
    vsfiltermod: !!resolveBin('VSFilterMod.dll'),
    avisynth: !!resolveBin('AviSynth.dll'),
  }
}

module.exports = {
  APP_ROOT,
  BIN_DIR,
  resolveBin,
  checkBinaries,
  ffmpegPath: resolveBin('ffmpeg.exe'),
  ffprobePath: resolveBin('ffprobe.exe'),
}