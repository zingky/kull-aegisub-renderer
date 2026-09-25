// i18n.js — Từ điển song ngữ cho UI (Tiếng Việt / English).
// Không dùng thư viện ngoài: dict phẳng + hàm translate() + hook useLang().
import { useCallback, useEffect, useState } from 'react'

export const LANGS = [
  { id: 'vi', short: 'VI', label: 'Tiếng Việt' },
  { id: 'en', short: 'EN', label: 'English' },
]

const STORAGE_KEY = 'kull.lang'

const vi = {
  // ── Header ──
  'app.name': 'Kull Aegisub Renderer',
  'app.tagline': 'Hardsub ASS/SRT · FFmpeg + VSFilter',
  'lang.label': 'Ngôn ngữ',
  'bin.ready': 'đã sẵn sàng',
  'bin.missing': 'THIẾU — chạy npm run check:bin',

  // ── Tiêu đề các mục ──
  'sec1.title': '1 · File Nguồn',
  'sec1.hint': '4 ô kéo thả',
  'sec1.mergeDivider': 'đoạn đầu / đoạn cuối (tùy chọn)',
  'sec2.title': '2 · Engine Subtitle & Phần Cứng',
  'sec3.title': '3 · Chất Lượng Render',
  'sec4.title': '4 · Output & Điều Khiển',
  'bin.warn1': 'Thiếu bin/ffmpeg.exe / ffprobe.exe — chạy lệnh',
  'bin.warn2': 'để xem hướng dẫn tải bản portable.',

  // ── DropZone ──
  'dz.main': 'File Video chính',
  'dz.subtitle': 'File Subtitle',
  'dz.intro': 'File Video Intro (ghép đầu)',
  'dz.outro': 'File Video Outro (ghép cuối)',
  'dz.required': 'BẮT BUỘC',
  'dz.analyzing': 'đang phân tích…',
  'dz.subtitleReady': 'subtitle đã sẵn sàng',
  'dz.needMerge': 'Cần bật "Ghép Intro/Outro"',
  'dz.remove': 'Xóa file',
  'dz.dialogTitle': 'Chọn {label}',
  'dz.filterAll': 'Tất cả',
  'dz.filterVideo': 'Video',
  'dz.filterSubtitle': 'Subtitle',

  // ── Engine subtitle ──
  'eng.vsfiltermod.desc': 'Mặc định · hiệu ứng Aegisub chính xác nhất, karaoke mượt',
  'eng.vsfilter.desc': 'Bản xy-VSFilter có TextSub · render qua AviSynth+ bundled',
  'eng.libass.desc': 'Không cần plugin · tốc độ cao nhất',

  // ── Phần cứng ──
  'hw.auto': 'Tự động',
  'hw.autoSub': 'Ưu tiên GPU',
  'hw.nvenc': 'NVIDIA NVENC',
  'hw.nvencSub': 'GPU NVIDIA',
  'hw.qsv': 'Intel QSV',
  'hw.qsvSub': 'GPU Intel',
  'hw.amf': 'AMD AMF',
  'hw.amfSub': 'GPU AMD',
  'hw.cpu': 'CPU (x264/x265)',
  'hw.cpuSub': 'Luôn khả dụng',
  'hw.unavailable': 'Không phát hiện được encoder này trên máy',
  'hw.autoHint': 'Tự chọn: NVENC → QSV → AMF → CPU.',

  // ── Chất lượng ──
  'q.original': 'Giữ nguyên gốc',
  'q.original.desc': 'Mặc định · giữ 100% res/fps, bitrate Constrained VBR theo file gốc',
  'q.high': 'Chất lượng cao',
  'q.high.desc': 'Nét 90-95% gốc, dung lượng ~70-80%',
  'q.balanced': 'Cân bằng',
  'q.balanced.desc': 'Tối ưu chia sẻ mạng xã hội',
  'q.small': 'Tiết kiệm',
  'q.small.desc': 'Nén nhỏ tối đa',
  'q.custom': 'Tùy chỉnh',
  'q.custom.desc': 'Nhập Resolution, FPS, Bitrate',
  'q.hint': 'Gợi ý: 1080p→4500-6000 · 720p→2500-4000 · 480p→1000-1500 kbps (H.264)',
  'q.resolution': 'Resolution',
  'q.fps': 'FPS',
  'q.bitrate': 'Bitrate (kbps)',

  // ── Ghép Intro/Outro ──
  'merge.label': 'Ghép Intro/Outro vào Video chính',
  'merge.tip': 'Intro/Outro được tự động Scale + Pad về đúng độ phân giải & FPS của video chính, rồi ghép bằng filter concat.',

  // ── Output ──
  'out.dir': 'Thư mục lưu',
  'out.dirPlaceholder': 'Mặc định: thư mục video chính',
  'out.browse': 'Chọn',
  'out.name': 'Tên file xuất',
  'out.format': 'Định dạng',
  'out.start': 'BẮT ĐẦU RENDER',
  'out.cancel': 'HỦY',
  'out.openFolder': 'Mở thư mục chứa file xuất',
  'fmt.mp4.desc': 'Phổ biến nhất · xem mọi nơi, up Youtube/Facebook',
  'fmt.mkv.desc': 'Chất lượng cao · giữ nhiều track audio/sub',
  'fmt.mov.desc': 'Chuẩn Apple · dựng phim Final Cut/Premiere',
  'fmt.webm.desc': 'Nhẹ · tối ưu phát trực tuyến trên web',
  'fmt.avi.desc': 'Tương thích máy cũ, đầu phát cổ',

  // ── Tiến trình ──
  'pg.rendering': 'Đang render…',
  'pg.fps': 'FPS',
  'pg.eta': 'Còn lại:',
  'pg.doneTitle': 'Render thành công 100%',
  'pg.outputFile': 'File xuất:',
  'pg.unknown': '(chưa xác định)',
  'pg.errorTitle': 'Render thất bại',
  'pg.errorHint': 'Xem chi tiết lỗi trong Console Log bên dưới.',
  'pg.idlePre': 'Chưa có tác vụ — chọn file & bấm',
  'pg.idlePost': '.',

  // ── Console log ──
  'log.title': 'Console Log',
  'log.sub': 'FFmpeg stderr + thông báo hệ thống',
  'log.copy': 'Copy log',
  'log.copied': 'Đã copy!',
  'log.copyTip': 'Copy toàn bộ log vào clipboard',
  'log.empty': '— Chưa có log. Các thông báo sẽ xuất hiện tại đây —',

  // ── Error boundary ──
  'err.title': '⚠ Giao diện gặp lỗi (không mất dữ liệu)',
  'err.retry': 'Thử hiển thị lại',

  // ── Log thông báo trong app ──
  'msg.canceled': 'Render đã bị hủy bởi người dùng.',
  'msg.done': '🎬 Render hoàn tất 100% — file đã sẵn sàng!',
  'msg.pickedSub': '📝 Đã chọn subtitle: {name}',
  'msg.probing': '🔍 Đang phân tích: {name}…',
  'msg.probeOk': '✓ {name}: {res} @ {fps}fps · {dur} · bitrate ~{br}kbps',
  'msg.probeFail': '✗ Không đọc được {name}: {msg}',
  'msg.openFolderFail': 'Không mở được thư mục: {msg}',
  'msg.needMain': '⚠ Vui lòng chọn File Video chính.',
  'msg.needSub': '⚠ Vui lòng chọn File Subtitle.',
  'msg.needOutput': '⚠ Thiếu thư mục hoặc tên file xuất.',
  'msg.needIntroOutro': '⚠ Đã bật ghép Intro/Outro nhưng chưa chọn ít nhất 1 file Intro hoặc Outro.',
  'msg.startFail': 'Không khởi động được render: {msg}',
  'stat.speed': 'tốc',
  'stat.size': 'dung lượng',

  // ── ETA dạng chữ ──
  'eta.hour': '{n} giờ',
  'eta.min': '{n} phút',
  'eta.sec': '{n} giây',

  // ── Preview + Trim (v2.0) ──
  'pv.title': 'Xem trước & Cắt đoạn (A→B)',
  'pv.assFail': 'Không preview được phụ đề (file render vẫn chuẩn)',
  'pv.codecFail': 'Codec này không xem trước được trong app — render vẫn bình thường.',
  'pv.toStart': 'Về đầu',
  'pv.toEnd': 'Tới cuối',
  'pv.setA': 'Đặt A',
  'pv.setB': 'Đặt B',
  'pv.exportClip': 'Xuất clip A→B',
  'pv.exportTip': 'Xuất riêng đoạn A→B (không phụ đề, giữ định dạng gốc)',
  'pv.addClip': '＋ Thêm cặp A→B',
  'pv.noClip': 'Chưa có clip — đặt A rồi B rồi bấm "Thêm cặp A→B"',
  'pv.exportN': 'Xuất {n} clip',
  'pv.clipHint': 'Xuất nhiều clip trong 1 lần — tách hẳn khỏi nút Render',
  'pv.removeClip': 'Xóa clip này',
  'pv.trimOn': 'SẼ CẮT A→B khi render',
  'fade.label': 'Fade đầu & cuối video',
  'fade.tip': 'Video mờ dần từ đen ở khung đầu và mờ dần sang đen ở khung cuối. Có Intro/Outro thì fade áp cho đoạn đầu tiên và đoạn cuối cùng của thành phẩm.',
  'fade.durLabel': 'Thời gian fade:',
  'fade.unit': 'ms',
}

const en = {
  // ── Header ──
  'app.name': 'Kull Aegisub Renderer',
  'app.tagline': 'Hardsub ASS/SRT · FFmpeg + VSFilter',
  'lang.label': 'Language',
  'bin.ready': 'ready',
  'bin.missing': 'MISSING — run npm run check:bin',

  // ── Section titles ──
  'sec1.title': '1 · Source Files',
  'sec1.hint': '4 drop zones',
  'sec1.mergeDivider': 'intro / outro clips (optional)',
  'sec2.title': '2 · Subtitle Engine & Hardware',
  'sec3.title': '3 · Render Quality',
  'sec4.title': '4 · Output & Controls',
  'bin.warn1': 'Missing bin/ffmpeg.exe / ffprobe.exe — run',
  'bin.warn2': 'to see portable download instructions.',

  // ── DropZone ──
  'dz.main': 'Main video',
  'dz.subtitle': 'Subtitle file',
  'dz.intro': 'Intro video (prepend)',
  'dz.outro': 'Outro video (append)',
  'dz.required': 'REQUIRED',
  'dz.analyzing': 'analyzing…',
  'dz.subtitleReady': 'subtitle ready',
  'dz.needMerge': 'Enable "Merge Intro/Outro"',
  'dz.remove': 'Remove file',
  'dz.dialogTitle': 'Select {label}',
  'dz.filterAll': 'All files',
  'dz.filterVideo': 'Video',
  'dz.filterSubtitle': 'Subtitle',

  // ── Subtitle engine ──
  'eng.vsfiltermod.desc': 'Default · most accurate Aegisub effects, smooth karaoke',
  'eng.vsfilter.desc': 'xy-VSFilter build with TextSub · rendered via bundled AviSynth+',
  'eng.libass.desc': 'No plugin required · fastest speed',

  // ── Hardware ──
  'hw.auto': 'Auto',
  'hw.autoSub': 'Prefer GPU',
  'hw.nvenc': 'NVIDIA NVENC',
  'hw.nvencSub': 'NVIDIA GPU',
  'hw.qsv': 'Intel QSV',
  'hw.qsvSub': 'Intel GPU',
  'hw.amf': 'AMD AMF',
  'hw.amfSub': 'AMD GPU',
  'hw.cpu': 'CPU (x264/x265)',
  'hw.cpuSub': 'Always available',
  'hw.unavailable': 'This encoder was not detected on this machine',
  'hw.autoHint': 'Auto pick: NVENC → QSV → AMF → CPU.',

  // ── Quality ──
  'q.original': 'Keep original',
  'q.original.desc': 'Default · keep 100% resolution/fps, Constrained VBR bitrate from source',
  'q.high': 'High quality',
  'q.high.desc': '90-95% of source sharpness, ~70-80% file size',
  'q.balanced': 'Balanced',
  'q.balanced.desc': 'Optimized for social media sharing',
  'q.small': 'Small size',
  'q.small.desc': 'Maximum compression',
  'q.custom': 'Custom',
  'q.custom.desc': 'Enter resolution, FPS, bitrate',
  'q.hint': 'Suggested: 1080p→4500-6000 · 720p→2500-4000 · 480p→1000-1500 kbps (H.264)',
  'q.resolution': 'Resolution',
  'q.fps': 'FPS',
  'q.bitrate': 'Bitrate (kbps)',

  // ── Intro/Outro merge ──
  'merge.label': 'Merge Intro/Outro into main video',
  'merge.tip': 'Intro/Outro is auto scaled + padded to the main video resolution & FPS, then merged with the concat filter.',

  // ── Output ──
  'out.dir': 'Output folder',
  'out.dirPlaceholder': 'Default: main video folder',
  'out.browse': 'Browse',
  'out.name': 'Output file name',
  'out.format': 'Format',
  'out.start': 'START RENDER',
  'out.cancel': 'CANCEL',
  'out.openFolder': 'Open output folder',
  'fmt.mp4.desc': 'Most common · plays anywhere, upload to Youtube/Facebook',
  'fmt.mkv.desc': 'High quality · keeps multiple audio/sub tracks',
  'fmt.mov.desc': 'Apple standard · Final Cut/Premiere editing',
  'fmt.webm.desc': 'Light · optimized for web streaming',
  'fmt.avi.desc': 'Compatible with old machines and players',

  // ── Progress ──
  'pg.rendering': 'Rendering…',
  'pg.fps': 'FPS',
  'pg.eta': 'ETA:',
  'pg.doneTitle': 'Render completed 100%',
  'pg.outputFile': 'Output:',
  'pg.unknown': '(unknown)',
  'pg.errorTitle': 'Render failed',
  'pg.errorHint': 'See error details in the Console Log below.',
  'pg.idlePre': 'No task yet — pick files & press',
  'pg.idlePost': '.',

  // ── Console log ──
  'log.title': 'Console Log',
  'log.sub': 'FFmpeg stderr + system messages',
  'log.copy': 'Copy log',
  'log.copied': 'Copied!',
  'log.copyTip': 'Copy the whole log to clipboard',
  'log.empty': '— No logs yet. Messages will appear here —',

  // ── Error boundary ──
  'err.title': '⚠ The UI hit an error (no data lost)',
  'err.retry': 'Try rendering again',

  // ── In-app log messages ──
  'msg.canceled': 'Render was canceled by the user.',
  'msg.done': '🎬 Render finished 100% — file is ready!',
  'msg.pickedSub': '📝 Subtitle selected: {name}',
  'msg.probing': '🔍 Analyzing: {name}…',
  'msg.probeOk': '✓ {name}: {res} @ {fps}fps · {dur} · bitrate ~{br}kbps',
  'msg.probeFail': '✗ Cannot read {name}: {msg}',
  'msg.openFolderFail': 'Cannot open folder: {msg}',
  'msg.needMain': '⚠ Please select the main video file.',
  'msg.needSub': '⚠ Please select the subtitle file.',
  'msg.needOutput': '⚠ Missing output folder or output file name.',
  'msg.needIntroOutro': '⚠ Intro/Outro merge is enabled but no Intro or Outro file was selected.',
  'msg.startFail': 'Cannot start render: {msg}',
  'stat.speed': 'speed',
  'stat.size': 'size',

  // ── Preview + Trim (v2.0) ──
  'pv.title': 'Preview & Trim (A→B)',
  'pv.assFail': 'Subtitle preview unavailable (final render unaffected)',
  'pv.codecFail': 'This codec cannot be previewed in-app — rendering still works normally.',
  'pv.toStart': 'Go to start',
  'pv.toEnd': 'Go to end',
  'pv.setA': 'Set A',
  'pv.setB': 'Set B',
  'pv.exportClip': 'Export clip A→B',
  'pv.exportTip': 'Export the A→B segment only (no subtitles, original format kept)',
  'pv.addClip': '+ Add A→B pair',
  'pv.noClip': 'No clips yet — set A, then B, then "Add A→B pair"',
  'pv.exportN': 'Export {n} clips',
  'pv.clipHint': 'Export several clips in one go — fully separate from the Render button',
  'pv.removeClip': 'Remove this clip',
  'pv.trimOn': 'WILL TRIM A→B on render',
  'fade.label': 'Fade in & out',
  'fade.tip': 'Fades from black on the first frame and to black on the last frame. When Intro/Outro is used, the fade applies to the first and last segment of the final video.',
  'fade.durLabel': 'Fade duration:',
  'fade.unit': 'ms',

  // ── Text ETA ──
  'eta.hour': '{n} h',
  'eta.min': '{n} min',
  'eta.sec': '{n} s',
}

export const DICT = { vi, en }

/** Dịch một khoá theo ngôn ngữ hiện tại; hỗ trợ nội suy biến dạng {ten}. */
export function translate(lang, key, vars) {
  const table = DICT[lang] || DICT.vi
  let s = table[key] ?? DICT.vi[key] ?? key
  if (vars) {
    for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]))
  }
  return s
}

/** Đọc ngôn ngữ đã lưu (localStorage có thể bị chặn ở origin opaque → bọc try/catch). */
function readStoredLang() {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v === 'vi' || v === 'en') return v
  } catch (e) {
    /* bỏ qua: dùng mặc định */
  }
  return 'vi'
}

function storeLang(lang) {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang)
  } catch (e) {
    /* bỏ qua */
  }
}

/** Hook quản lý ngôn ngữ UI: { lang, setLang, t }. */
export function useLang() {
  const [lang, setLang] = useState(readStoredLang)
  useEffect(() => {
    storeLang(lang)
    try {
      document.documentElement.lang = lang
    } catch (e) {
      /* bỏ qua */
    }
  }, [lang])
  const t = useCallback((key, vars) => translate(lang, key, vars), [lang])
  return { lang, setLang, t }
}


