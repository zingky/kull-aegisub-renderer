use serde::{Deserialize, Serialize};

/// Ngôn ngữ giao diện / thông báo engine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, Hash)]
pub enum Lang {
    #[default]
    Vi,
    En,
}

impl Lang {
    pub fn as_str(&self) -> &'static str {
        match self {
            Lang::Vi => "vi",
            Lang::En => "en",
        }
    }
}

/// Kết quả probe file media bằng ffprobe (thay vì JS object loosely-typed).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaMeta {
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub duration: f64,
    pub bitrate_avg_kbps: u32,
    pub video_codec: String,
    pub audio_codec: String,
    pub has_audio: bool,
    pub sample_rate: u32,
    pub channels: u32,
    pub size_bytes: u64,
}

/// Đề xuất xuất (container).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OutputFormat {
    Mp4,
    Mkv,
    Webm,
}

impl OutputFormat {
    pub fn ext(&self) -> &'static str {
        match self {
            OutputFormat::Mp4 => "mp4",
            OutputFormat::Mkv => "mkv",
            OutputFormat::Webm => "webm",
        }
    }
}

/// Preset chất lượng render (Constrained VBR).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum QualityPreset {
    Original,
    High,
    Balanced,
    Small,
    Custom,
}

impl Default for QualityPreset {
    fn default() -> Self {
        QualityPreset::Original
    }
}

/// Chất lượng tuỳ chỉnh do người dùng nhập.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CustomQuality {
    pub resolution: String, // "1280x720"
    pub fps: String,        // "30"
    pub bitrate: String,    // kbps
}

/// Đoạn cắt A→B (giây).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Trim {
    pub enabled: bool,
    pub start: f64,
    pub end: f64,
}

impl Trim {
    pub fn duration(&self) -> f64 {
        (self.end - self.start).max(0.0)
    }
    pub fn is_valid(&self) -> bool {
        self.enabled && self.end > self.start
    }
}

/// Hiệu ứng mờ đầu/cuối (ms).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Fades {
    pub enabled: bool,
    pub duration_ms: u32,
}

impl Fades {
    pub fn duration_sec(&self) -> f64 {
        (self.duration_ms as f64 / 1000.0).clamp(0.05, 3.0)
    }
}

/// Tùy chọn render đầy đủ (thay cho JS `options` object loosely-typed).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RenderOptions {
    pub main_video: String,
    pub subtitle: Option<String>,
    pub intro: Option<String>,
    pub outro: Option<String>,
    pub engine: SubtitleEngine,
    pub hardware: Hardware,
    pub quality: QualityPreset,
    pub custom: Option<CustomQuality>,
    pub merge_enabled: bool,
    pub fade: Fades,
    pub output_dir: String,
    pub output_name: String,
    pub output_format: OutputFormat,
    pub lang: Lang,
    pub trim: Trim,
}

impl RenderOptions {
    /// Đường dẫn file xuất đầy đủ.
    pub fn output_path(&self) -> String {
        let name = crate::types::with_ext(&self.output_name, self.output_format.ext());
        if self.output_dir.is_empty() {
            name
        } else {
            format!("{}\\{}", self.output_dir, name)
        }
    }
}

/// Engine phụ đề (libass native hoặc VSFilter qua AviSynth).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SubtitleEngine {
    Libass,
    Vsfiltermod,
    Vsfilter,
}

impl Default for SubtitleEngine {
    fn default() -> Self {
        SubtitleEngine::Vsfiltermod
    }
}

impl SubtitleEngine {
    pub fn as_str(&self) -> &'static str {
        match self {
            SubtitleEngine::Libass => "libass",
            SubtitleEngine::Vsfiltermod => "vsfiltermod",
            SubtitleEngine::Vsfilter => "vsfilter",
        }
    }
}

/// Phần cứng mã hóa ưu tiên.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Hardware {
    Auto,
    Nvenc,
    Qsv,
    Amf,
    Cpu,
}

impl Default for Hardware {
    fn default() -> Self {
        Hardware::Auto
    }
}

impl Hardware {
    pub fn as_str(&self) -> &'static str {
        match self {
            Hardware::Auto => "auto",
            Hardware::Nvenc => "nvenc",
            Hardware::Qsv => "qsv",
            Hardware::Amf => "amf",
            Hardware::Cpu => "cpu",
        }
    }
}

/// Kết quả xuất một lần render.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RenderResult {
    pub output_path: String,
    pub duration: f64,
    pub elapsed_sec: f64,
    pub canceled: bool,
}

/// Thời gian hiển thị (HH:MM:SS) — dành cho thời lượng video, KHÔNG dùng nhầm với wall-clock.
pub fn format_duration(secs: f64) -> String {
    let secs = secs.max(0.0).floor() as u64;
    let h = secs / 3600;
    let m = (secs % 3600) / 60;
    let s = secs % 60;
    format!("{:02}:{:02}:{:02}", h, m, s)
}

/// Thời gian thực đã chờ (wall-clock), dạng "9m 51s" / "1h 04m".
pub fn format_elapsed(secs: f64) -> String {
    let secs = secs.max(0.0).round() as u64;
    if secs < 60 {
        return format!("{}s", secs);
    }
    let m = secs / 60;
    let s = secs % 60;
    if m < 60 {
        if s == 0 {
            return format!("{}m", m);
        }
        return format!("{}m {:02}s", m, s);
    }
    let h = m / 60;
    let m = m % 60;
    format!("{}h {:02}m", h, m)
}

/// Kích thước byte đọc được (KB/MB/GB… theo 1024, khớp ffprobe KiB/MiB).
pub fn format_bytes(bytes: u64) -> String {
    if bytes == 0 {
        return "—".into();
    }
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    let mut v = bytes as f64;
    let mut u = 0usize;
    while v >= 1024.0 && u < UNITS.len() - 1 {
        v /= 1024.0;
        u += 1;
    }
    let decimals = if u == 0 { 0 } else { 1 };
    format!("{:.*} {}", decimals, v, UNITS[u])
}

/// Đuôi file đã biết (dùng để chỉ cắt đuôi thật, không cắt nhầm dấu chấm trong tên).
const KNOWN_EXTS: &[&str] = &[
    "mp4", "mkv", "mov", "m4v", "webm", "avi", "mpg", "mpeg", "wmv", "flv", "ts", "m2ts",
    "gif", "png", "jpg", "jpeg", "webp", "bmp", "mp3", "aac", "wav", "flac", "ogg", "opus",
    "ass", "ssa", "srt", "vtt", "txt",
];

/// Cắt đuôi file CHỈ KHI phần sau dấu chấm cuối là đuôi đã biết.
/// Tên như "abc [Full Ver.] xyz" sẽ được giữ nguyên (không cắt tại "Ver.").
pub fn strip_ext(name: &str) -> &str {
    let name = name.trim();
    match name.rfind('.') {
        Some(i) if i > 0 => {
            let ext = name[i + 1..].to_lowercase();
            if KNOWN_EXTS.contains(&ext.as_str()) {
                &name[..i]
            } else {
                name
            }
        }
        _ => name,
    }
}

/// Ghép đuôi file vào tên.
/// Lưu ý: chỉ cắt phần đuôi CUỐI CÙNG, không được dùng `rsplit('.').next()`
/// (lệnh đó trả về chính phần đuôi → tên file bị mất đầu, vd
/// "abc [Full Ver.] xyz_exported" → "] xyz_exported").
pub fn with_ext(name: &str, ext: &str) -> String {
    let ext = if ext.starts_with('.') {
        ext.to_string()
    } else {
        format!(".{}", ext)
    };
    let base = strip_ext(name);
    let base = if base.trim().is_empty() { "output" } else { base };
    format!("{}{}", base, ext.to_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn with_ext_only_strips_last_extension() {
        // Tên có dấu chấm ở giữa + ngoặc vuông (đúng ca lỗi thực tế)
        assert_eq!(
            with_ext("East Of Eden _ Ghost Sequence [Lyric Video Full Ver.] TVアニメ『とある暗部の少女共棲』OP主題歌_exported", "mp4"),
            "East Of Eden _ Ghost Sequence [Lyric Video Full Ver.] TVアニメ『とある暗部の少女共棲』OP主題歌_exported.mp4"
        );
        // Tên đã có đuôi → thay đuôi
        assert_eq!(with_ext("movie.final.mkv", "MP4"), "movie.final.mp4");
        // Không có dấu chấm
        assert_eq!(with_ext("fff_exported", "mp4"), "fff_exported.mp4");
        // Rỗng / chỉ khoảng trắng
        assert_eq!(with_ext("   ", "mp4"), "output.mp4");
        // Đuôi đã có dấu chấm
        assert_eq!(with_ext("a.mkv", ".mkv"), "a.mkv");
        // Dấu chấm không phải đuôi file → giữ nguyên (không cắt mất chữ)
        assert_eq!(with_ext("a.b", ".mkv"), "a.b.mkv");
    }

    #[test]
    fn output_path_keeps_full_name() {
        let opts = RenderOptions {
            main_video: "E:\\v\\in.mp4".into(),
            subtitle: None,
            intro: None,
            outro: None,
            engine: SubtitleEngine::Libass,
            hardware: Hardware::Auto,
            quality: QualityPreset::Balanced,
            custom: None,
            merge_enabled: false,
            fade: Fades { enabled: false, duration_ms: 0 },
            output_dir: "E:\\out".into(),
            output_name: "abc [Full Ver.] xyz_exported".into(),
            output_format: OutputFormat::Mp4,
            lang: Lang::Vi,
            trim: Trim { enabled: false, start: 0.0, end: 0.0 },
        };
        assert_eq!(
            opts.output_path(),
            "E:\\out\\abc [Full Ver.] xyz_exported.mp4"
        );
    }
}

