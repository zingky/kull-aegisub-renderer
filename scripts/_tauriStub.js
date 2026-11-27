'use strict'
/**
 * _tauriStub.js — giả lập lớp IPC của Tauri cho các test chạy bundle thật trong jsdom.
 *
 * Bundle production gọi `window.__TAURI_INTERNALS__.invoke(cmd, args)` (kể cả khi
 * `window.renderAPI` tồn tại), nên chỉ mock `renderAPI` là không đủ.
 *
 *   const { installTauriStub } = require('./_tauriStub')
 *   installTauriStub(w, { select_file: () => 'D:\\video.mp4' })
 */
function installTauriStub(w, handlers = {}) {
  const table = {
    init: () => null,
    get_app_version: () => '2.1.0-test',
    check_bin: () => ({ ffmpeg: true, ffprobe: true, avisynth: true, vsfilter: true, vsfiltermod: true }),
    detect_encoders: () => ['cpu'],
    select_file: () => null,
    select_dir: () => null,
    probe_media: () => null,
    subtitle_info: () => null,
    render_preview_frame: () => ({ ok: false }),
    extract_thumbs: () => ({ thumbs: [], dir: null }),
    cleanup_thumbs: () => null,
    'plugin:event|listen': () => 1,
    'plugin:event|unlisten': () => null,
    ...handlers,
  }

  w.__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      const fn = table[cmd]
      return typeof fn === 'function' ? fn(args) : null
    },
    transformCallback: () => 1,
    convertFileSrc: (p) => 'file:///' + String(p).replace(/\\/g, '/'),
  }
  w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} }
  return w.__TAURI_INTERNALS__
}

module.exports = { installTauriStub }
