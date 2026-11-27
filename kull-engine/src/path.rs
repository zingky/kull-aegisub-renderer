use std::fs;
use std::path::{Path, PathBuf};

/// Thoát đường dẫn Windows cho FFmpeg:
///   - \\ -> /
///   - :  -> \:  (quan trọng với ổ đĩa C:\...)
///   - '  -> \'
pub fn escape_filter_path(p: &str) -> String {
    p.replace('\\', "/").replace(':', "\\:").replace('\'', "\\'")
}

/// Thư mục dữ liệu do app tự giải nén khi chạy 1 file exe duy nhất:
/// `%LOCALAPPDATA%\Kull Aegisub Renderer`.
pub fn local_data_root() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(|p| PathBuf::from(p).join("Kull Aegisub Renderer"))
}

/// `%LOCALAPPDATA%\Kull Aegisub Renderer\bin` nếu đã được giải nén.
pub fn local_bin_dir() -> Option<PathBuf> {
    let p = local_data_root()?.join("bin");
    if p.exists() {
        Some(p)
    } else {
        None
    }
}

/// Thư mục chứa bin/ (portable): ưu tiên <resources>/bin, fallback <project>/bin,
/// rồi <exe_dir>/bin, cuối cùng là thư mục app tự giải nén trong %LOCALAPPDATA%.
pub fn resolve_bin_dir(resources_path: Option<&str>, project_root: &Path) -> PathBuf {
    if let Some(rp) = resources_path {
        let p = Path::new(rp).join("bin");
        if p.exists() {
            return p;
        }
    }
    let p = project_root.join("bin");
    if p.exists() {
        return p;
    }
    // Portable: tìm bin/ cùng cấp với file .exe
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let p = dir.join("bin");
            if p.exists() {
                return p;
            }
        }
    }
    // Chạy từ 1 file exe duy nhất: dùng bin/ đã tự giải nén.
    if let Some(p) = local_bin_dir() {
        return p;
    }
    project_root.join("bin")
}

pub fn resolve_bin(bin_dir: &Path, name: &str) -> Option<PathBuf> {
    let p = bin_dir.join(name);
    if p.exists() {
        Some(p)
    } else {
        None
    }
}

#[derive(Debug, Clone)]
pub struct Binaries {
    pub bin_dir: PathBuf,
    pub ffmpeg: Option<PathBuf>,
    pub ffprobe: Option<PathBuf>,
    pub vsfilter: Option<PathBuf>,
    pub vsfiltermod: Option<PathBuf>,
    pub avisynth: Option<PathBuf>,
    pub direct_show_source: Option<PathBuf>,
}

impl Binaries {
    pub fn check(bin_dir: &Path) -> Self {
        let avsplugins = bin_dir.join("avsplugins");
        Self {
            bin_dir: bin_dir.to_path_buf(),
            ffmpeg: resolve_bin(bin_dir, "ffmpeg.exe"),
            ffprobe: resolve_bin(bin_dir, "ffprobe.exe"),
            vsfilter: resolve_bin(bin_dir, "VSFilter.dll"),
            vsfiltermod: resolve_bin(bin_dir, "VSFilterMod.dll"),
            avisynth: resolve_bin(bin_dir, "AviSynth.dll"),
            direct_show_source: resolve_bin(&avsplugins, "DirectShowSource.dll"),
        }
    }
    pub fn all_present(&self) -> bool {
        self.ffmpeg.is_some() && self.ffprobe.is_some()
    }
    pub fn ffmpeg_path(&self) -> Option<&PathBuf> {
        self.ffmpeg.as_ref()
    }
    pub fn ffprobe_path(&self) -> Option<&PathBuf> {
        self.ffprobe.as_ref()
    }
}

/// Đọc toàn bộ nội dung file văn bản (UTF-8).
pub fn read_text(path: &Path) -> Result<String, std::io::Error> {
    fs::read_to_string(path)
}

/// Xóa file, bỏ qua lỗi nếu không tồn tại.
pub fn remove_file_ignore(path: &Path) {
    let _ = fs::remove_file(path);
}

/// Xóa thư mục đệ qui, bỏ qua lỗi.
pub fn remove_dir_all_ignore(path: &Path) {
    let _ = fs::remove_dir_all(path);
}
