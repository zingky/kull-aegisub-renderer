/**
 * electron/i18n.js — Từ điển thông báo của Core Engine (ghi ra Console Log).
 * UI gửi kèm `lang` khi gọi render → engine log đúng ngôn ngữ người dùng chọn.
 */
'use strict'

const DICT = {
  vi: {
    'eng.start': '━━━ BẮT ĐẦU RENDER ━━━',
    'eng.probing': 'Đang phân tích file bằng ffprobe...',
    'eng.mainMeta': 'Thông số chuẩn: {w}x{h} @ {fps}fps, bitrate gốc ~{br}kbps',
    'eng.encoder': 'Encoder: {name} #[{label}]{fallback}',
    'eng.fallbackTag': ' (fallback do thiếu GPU)',
    'eng.bitrate': 'Bitrate: {b}k | Maxrate: {m}k | Bufsize: {u}k (Constrained VBR)',
    'eng.merge': 'Ghép Intro/Outro: {n} phân đoạn, scale/pad về {w}x{h}@{fps}fps',
    'eng.output': 'Output: {path}',
    'eng.avsOk': 'Engine phụ đề: {dll} qua AviSynth+ (TextSub)',
    'eng.libassOk': 'Engine phụ đề: libass (FFmpeg native subtitles filter)',
    'eng.swapNote': '{preferred} không cung cấp TextSub cho AviSynth (bản DirectShow-only) → dùng {dll} thay thế (tương đương hiệu ứng Aegisub).',
    'eng.warnNoPlugin': 'Không có plugin VSFilter nào mở được (không chứa hàm TextSub cho AviSynth) hoặc không decode được video. Đã tự chuyển sang libass.',
    'eng.warnNoAviSynth': 'Thiếu AviSynth core (bin/AviSynth.dll hoặc AviSynth+ hệ thống) hoặc FFmpeg thiếu demuxer avisynth. Đã tự chuyển sang libass.',
    'eng.retryLibass': '— AviSynth/VSFilter gặp lỗi khi render, tự động thử lại bằng libass —',
    'eng.canceled': 'Đã hủy bởi người dùng.',
    'eng.done': '✅ Render hoàn tất! Tổng thời lượng {dur}',
    'eng.errStart': 'Không khởi động được FFmpeg: {msg}',
    'eng.errRun': 'Không chạy được FFmpeg: {msg}',
    'eng.errExit': 'FFmpeg thoát với mã lỗi {code}. Kiểm tra log bên dưới để khắc phục.',
    'eng.errGeneric': 'Không thể render.',
    'eng.errProbeRun': 'Không chạy được ffprobe: {msg}',
    'eng.errProbeCode': 'ffprobe lỗi (exit {code}): {detail}',
    'eng.errProbeParse': 'Không phân tích được output ffprobe: {msg}',
    'eng.cpuFallback': 'CPU (fallback: thiếu GPU encoder)',
  },
  en: {
    'eng.start': '━━━ RENDER STARTED ━━━',
    'eng.probing': 'Analyzing files with ffprobe...',
    'eng.mainMeta': 'Target specs: {w}x{h} @ {fps}fps, source bitrate ~{br}kbps',
    'eng.encoder': 'Encoder: {name} #[{label}]{fallback}',
    'eng.fallbackTag': ' (fallback: no GPU encoder)',
    'eng.bitrate': 'Bitrate: {b}k | Maxrate: {m}k | Bufsize: {u}k (Constrained VBR)',
    'eng.merge': 'Intro/Outro merge: {n} segments, scaled/padded to {w}x{h}@{fps}fps',
    'eng.output': 'Output: {path}',
    'eng.avsOk': 'Subtitle engine: {dll} via AviSynth+ (TextSub)',
    'eng.libassOk': 'Subtitle engine: libass (FFmpeg native subtitles filter)',
    'eng.swapNote': '{preferred} does not expose TextSub to AviSynth (DirectShow-only build) → using {dll} instead (equivalent Aegisub effects).',
    'eng.warnNoPlugin': 'No VSFilter plugin could be opened (no TextSub for AviSynth) or the video could not be decoded. Switched to libass automatically.',
    'eng.warnNoAviSynth': 'AviSynth core is missing (bin/AviSynth.dll or system AviSynth+) or FFmpeg lacks the avisynth demuxer. Switched to libass automatically.',
    'eng.retryLibass': '— AviSynth/VSFilter failed during render, retrying with libass —',
    'eng.canceled': 'Canceled by the user.',
    'eng.done': '✅ Render finished! Total duration {dur}',
    'eng.errStart': 'Cannot start FFmpeg: {msg}',
    'eng.errRun': 'Cannot run FFmpeg: {msg}',
    'eng.errExit': 'FFmpeg exited with code {code}. Check the log below to fix it.',
    'eng.errGeneric': 'Cannot render.',
    'eng.errProbeRun': 'Cannot run ffprobe: {msg}',
    'eng.errProbeCode': 'ffprobe error (exit {code}): {detail}',
    'eng.errProbeParse': 'Cannot parse ffprobe output: {msg}',
    'eng.cpuFallback': 'CPU (fallback: no GPU encoder)',
  },
}

/** Dịch khoá theo ngôn ngữ, hỗ trợ nội suy biến dạng {ten}. */
function translate(lang, key, vars) {
  const table = DICT[lang] || DICT.vi
  let s = table[key] ?? DICT.vi[key] ?? key
  if (vars) {
    for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]))
  }
  return s
}

/** Tạo hàm t(key, vars) gắn với 1 ngôn ngữ. */
function makeT(lang) {
  return (key, vars) => translate(lang, key, vars)
}

module.exports = { DICT, translate, makeT }