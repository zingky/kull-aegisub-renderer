pub use crate::types::Lang;
use std::collections::HashMap;

/// Từ điển thông báo của Core Engine (port từ `electron/i18n.js`).
/// Mỗi bản ghi là map `khoá -> mẫu tin` có thể nội suy `{biến}`.
#[derive(Debug, Clone, Default)]
pub struct Dictionary {
    tables: HashMap<Lang, HashMap<&'static str, &'static str>>,
}

impl Dictionary {
    pub fn new() -> Self {
        let mut tables = HashMap::new();
        tables.insert(Lang::Vi, vi_table());
        tables.insert(Lang::En, en_table());
        Self { tables }
    }

    /// Dịch khoá theo ngôn ngữ, hỗ trợ nội suy biến `{ten}`.
    pub fn translate(&self, lang: Lang, key: &str, vars: &[(&str, &str)]) -> String {
        let table = self
            .tables
            .get(&lang)
            .or_else(|| self.tables.get(&Lang::Vi))
            .unwrap();
        let mut s = table
            .get(key)
            .or_else(|| self.tables.get(&Lang::Vi).and_then(|t| t.get(key)))
            .copied()
            .unwrap_or(key)
            .to_string();
        for (k, v) in vars {
            s = s.replace(&format!("{{{}}}", k), v);
        }
        s
    }
}

/// Hàm t(key, vars) gắn với 1 ngôn ngữ.
pub struct T<'a> {
    dict: &'a Dictionary,
    lang: Lang,
}

impl<'a> T<'a> {
    pub fn new(dict: &'a Dictionary, lang: Lang) -> Self {
        Self { dict, lang }
    }
    pub fn call(&self, key: &str, vars: &[(&str, &str)]) -> String {
        self.dict.translate(self.lang, key, vars)
    }
}

pub fn make_t<'a>(dict: &'a Dictionary, lang: Lang) -> T<'a> {
    T::new(dict, lang)
}

fn vi_table() -> HashMap<&'static str, &'static str> {
    HashMap::from([
        ("eng.start", "━━━ BẮT ĐẦU RENDER ━━━"),
        ("eng.probing", "Đang phân tích file bằng ffprobe…"),
        ("eng.main_meta", "Thông số chuẩn: {w}x{h} @ {fps}fps, bitrate gốc ~{br}kbps"),
        ("eng.encoder", "Encoder: {name} #[{label}]{fallback}"),
        ("eng.fallback_tag", " (fallback do thiếu GPU)"),
        ("eng.bitrate", "Bitrate: {b}k | Maxrate: {m}k | Bufsize: {u}k (Constrained VBR)"),
        ("eng.merge", "Ghép Intro/Outro: {n} phân đoạn, scale/pad về {w}x{h}@{fps}fps"),
        ("eng.output", "Output: {path}"),
        ("eng.avs_ok", "Engine phụ đề: {dll} qua AviSynth+ ({fn})"),
        ("eng.libass_ok", "Engine phụ đề: libass (FFmpeg native subtitles filter)"),
        ("eng.swap_note", "{preferred} không nạp được qua AviSynth (thiếu DLL/lỗi plugin) → dùng {dll} thay thế (vẫn tương đương hiệu ứng Aegisub)."),
        ("eng.warn_no_plugin", "Không có plugin VSFilter nào mở được (không có hàm TextSub/TextSubMod cho AviSynth) hoặc không decode được video. Đã tự chuyển sang libass."),
        ("eng.warn_no_avisynth", "Thiếu AviSynth core (bin/AviSynth.dll hoặc AviSynth+ hệ thống) hoặc FFmpeg thiếu demuxer avisynth. Đã tự chuyển sang libass."),
        ("eng.retry_libass", "— AviSynth/VSFilter gặp lỗi khi render, tự động thử lại bằng libass —"),
        ("eng.canceled", "Đã hủy bởi người dùng."),
        ("eng.done", "✅ Render hoàn tất! Video {dur} · đã mất {took}"),
        ("eng.cloud_sync", "⚠ Thư mục output nằm trong \"{name}\" (thư mục đồng bộ đám mây) — tiến trình sync sẽ scan/upload file đang lớn dần và làm render chậm hơn. Nên xuất ra ổ cứng local để nhanh hơn."),
        ("eng.err_start", "Không khởi động được FFmpeg: {msg}"),
        ("eng.err_run", "Không chạy được FFmpeg: {msg}"),
        ("eng.err_exit", "FFmpeg thoát với mã lỗi {code}. Kiểm tra log bên dưới để khắc phục."),
        ("eng.err_generic", "Không thể render."),
        ("eng.err_probe_run", "Không chạy được ffprobe: {msg}"),
        ("eng.err_probe_code", "ffprobe lỗi (exit {code}): {detail}"),
        ("eng.err_probe_parse", "Không phân tích được output ffprobe: {msg}"),
        ("eng.cpu_fallback", "CPU (fallback: thiếu GPU encoder)"),
        ("trim.start", "━━━ XUẤT CLIP A→B ━━━"),
        ("trim.probing", "Đang đọc thông tin video để cắt…"),
        ("trim.range", "Cắt {start} → {end} (dài {dur}) · {w}x{h} @ {fps}fps"),
        ("trim.done", "✅ Đã xuất clip: {path}\n   Dài {dur} · {size} · mất {took}"),
        ("trim.short", "Đoạn cắt quá ngắn (tối thiểu 0,2 giây)."),
    ])
}

fn en_table() -> HashMap<&'static str, &'static str> {
    HashMap::from([
        ("eng.start", "━━━ RENDER STARTED ━━━"),
        ("eng.probing", "Analyzing files with ffprobe…"),
        ("eng.main_meta", "Target specs: {w}x{h} @ {fps}fps, source bitrate ~{br}kbps"),
        ("eng.encoder", "Encoder: {name} #[{label}]{fallback}"),
        ("eng.fallback_tag", " (fallback: no GPU encoder)"),
        ("eng.bitrate", "Bitrate: {b}k | Maxrate: {m}k | Bufsize: {u}k (Constrained VBR)"),
        ("eng.merge", "Intro/Outro merge: {n} segments, scaled/padded to {w}x{h}@{fps}fps"),
        ("eng.output", "Output: {path}"),
        ("eng.avs_ok", "Subtitle engine: {dll} via AviSynth+ ({fn})"),
        ("eng.libass_ok", "Subtitle engine: libass (FFmpeg native subtitles filter)"),
        ("eng.swap_note", "{preferred} could not be loaded via AviSynth (missing DLL / plugin error) → using {dll} instead (Aegisub effects still equivalent)."),
        ("eng.warn_no_plugin", "No VSFilter plugin could be opened (no TextSub/TextSubMod function for AviSynth) or the video could not be decoded. Switched to libass automatically."),
        ("eng.warn_no_avisynth", "AviSynth core is missing (bin/AviSynth.dll or system AviSynth+) or FFmpeg lacks the avisynth demuxer. Switched to libass automatically."),
        ("eng.retry_libass", "— AviSynth/VSFilter failed during render, retrying with libass —"),
        ("eng.canceled", "Canceled by the user."),
        ("eng.done", "✅ Render finished! Video {dur} · took {took}"),
        ("eng.cloud_sync", "⚠ Output folder is inside \"{name}\" (a cloud-synced folder) — the sync client keeps scanning/uploading the growing file and slows the render down. Export to a local drive for better speed."),
        ("eng.err_start", "Cannot start FFmpeg: {msg}"),
        ("eng.err_run", "Cannot run FFmpeg: {msg}"),
        ("eng.err_exit", "FFmpeg exited with code {code}. Check the log below to fix it."),
        ("eng.err_generic", "Cannot render."),
        ("eng.err_probe_run", "Cannot run ffprobe: {msg}"),
        ("eng.err_probe_code", "ffprobe error (exit {code}): {detail}"),
        ("eng.err_probe_parse", "Cannot parse ffprobe output: {msg}"),
        ("eng.cpu_fallback", "CPU (fallback: no GPU encoder)"),
        ("trim.start", "━━━ EXPORT CLIP A→B ━━━"),
        ("trim.probing", "Reading video info for trimming…"),
        ("trim.range", "Cut {start} → {end} (length {dur}) · {w}x{h} @ {fps}fps"),
        ("trim.done", "✅ Clip exported: {path}\n   Length {dur} · {size} · took {took}"),
        ("trim.short", "Selected segment is too short (min 0.2s)."),
    ])
}
