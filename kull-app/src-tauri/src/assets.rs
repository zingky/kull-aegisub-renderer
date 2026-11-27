//! Tự giải nén các file đi kèm (ffmpeg, ffprobe, AviSynth, VSFilter, …) từ kho
//! nhúng trong exe.
//!
//! - Nếu cạnh exe đã có sẵn `bin/` + `WebView2Loader.dll` (bản portable dev) thì
//!   dùng luôn, không giải nén gì.
//! - Ngược lại giải nén vào `%LOCALAPPDATA%\Kull Aegisub Renderer` một lần duy nhất.
//!
//! `WebView2Loader.dll` được giải nén ngay trong `main()` (rất nhỏ) để WebView2
//! nạp được trước khi cửa sổ được tạo; phần `bin/` nặng được giải nén trong lệnh
//! `init` để cửa sổ hiện ra ngay, không phải chờ.

use std::fs::{self, File};
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::Duration;

use flate2::read::DeflateDecoder;

static ARCHIVE: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/assets/kull_assets.bin"));

const MARKER: &str = ".kull-assets";
const LOCK: &str = ".kull-extract.lock";

const REQUIRED: &[&str] = &[
    "bin/ffmpeg.exe",
    "bin/ffprobe.exe",
    "bin/AviSynth.dll",
    "bin/VSFilter.dll",
    "bin/VSFilterMod.dll",
    "bin/avsplugins/DirectShowSource.dll",
    "WebView2Loader.dll",
];

static ROOT: OnceLock<PathBuf> = OnceLock::new();
static BIN_READY: OnceLock<Result<(), String>> = OnceLock::new();

fn root() -> &'static PathBuf {
    ROOT.get_or_init(detect_root)
}

fn detect_root() -> PathBuf {
    if let Some(dir) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
    {
        // Bản dev/portable: bin/ và DLL nằm ngay cạnh exe.
        if dir.join("bin").join("ffmpeg.exe").exists() && dir.join("WebView2Loader.dll").exists() {
            return dir;
        }
    }
    kull_engine::path::local_data_root()
        .unwrap_or_else(|| std::env::temp_dir().join("Kull Aegisub Renderer"))
}

fn marker_value() -> String {
    format!("{}|{}", env!("CARGO_PKG_VERSION"), ARCHIVE.len())
}

fn all_present(root: &Path) -> bool {
    REQUIRED
        .iter()
        .all(|rel| root.join(rel).metadata().map(|m| m.len() > 0).unwrap_or(false))
}

/// Giải nén `WebView2Loader.dll` (nếu chưa có). Gọi sớm trong `main()`.
pub fn ensure_webview2_dll() -> Result<PathBuf, String> {
    let root = root().clone();
    let dll = root.join("WebView2Loader.dll");
    if dll.metadata().map(|m| m.len() > 0).unwrap_or(false) {
        return Ok(dll);
    }
    fs::create_dir_all(&root).map_err(|e| format!("Không tạo được {}: {e}", root.display()))?;
    extract_entries(&root, Some("WebView2Loader.dll"))?;
    if dll.metadata().map(|m| m.len() > 0).unwrap_or(false) {
        Ok(dll)
    } else {
        Err("Không giải nén được WebView2Loader.dll từ exe".to_string())
    }
}

/// Giải nén toàn bộ ffmpeg/ffprobe/DLL phụ đề (một lần). Trả về thư mục gốc.
pub fn ensure_bin_assets() -> Result<PathBuf, String> {
    let root = root().clone();
    let out = BIN_READY.get_or_init(|| prepare(&root));
    match out {
        Ok(()) => Ok(root),
        Err(e) => Err(e.clone()),
    }
}

fn prepare(root: &Path) -> Result<(), String> {
    let marker = root.join(MARKER);
    let want = marker_value();

    if all_present(root) {
        let _ = fs::write(&marker, want);
        return Ok(());
    }

    fs::create_dir_all(root).map_err(|e| format!("Không tạo được {}: {e}", root.display()))?;

    // Một instance khác đang giải nén → chờ nó xong (tối đa 90s).
    let lock = root.join(LOCK);
    if lock.exists() {
        for _ in 0..450 {
            if all_present(root) {
                let _ = fs::write(&marker, want);
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        let _ = fs::remove_file(&lock); // khoá cũ bị treo
    }
    let _ = fs::write(&lock, std::process::id().to_string());

    let result = extract_entries(root, None);

    let _ = fs::remove_file(&lock);
    result?;

    for rel in REQUIRED {
        if !root.join(rel).metadata().map(|m| m.len() > 0).unwrap_or(false) {
            return Err(format!(
                "Giải nén chưa đầy đủ, thiếu: {}",
                root.join(rel).display()
            ));
        }
    }
    fs::write(&marker, want).map_err(|e| format!("Không ghi được marker: {e}"))?;
    Ok(())
}

fn read_u64(cur: &mut Cursor<&[u8]>) -> Result<u64, String> {
    let mut b = [0u8; 8];
    cur.read_exact(&mut b).map_err(|e| format!("Kho bị hỏng: {e}"))?;
    Ok(u64::from_le_bytes(b))
}

fn extract_entries(root: &Path, only: Option<&str>) -> Result<(), String> {
    let mut cur = Cursor::new(ARCHIVE);
    let mut magic = [0u8; 8];
    cur.read_exact(&mut magic).map_err(|e| format!("Kho bị hỏng: {e}"))?;
    if &magic != b"KULLA001" {
        return Err("Kho tài nguyên không đúng định dạng (magic sai)".to_string());
    }
    let mut b4 = [0u8; 4];
    cur.read_exact(&mut b4).map_err(|e| format!("Kho bị hỏng: {e}"))?;
    let count = u32::from_le_bytes(b4);

    for _ in 0..count {
        let mut b2 = [0u8; 2];
        cur.read_exact(&mut b2).map_err(|e| format!("Kho bị hỏng: {e}"))?;
        let mut name = vec![0u8; u16::from_le_bytes(b2) as usize];
        cur.read_exact(&mut name).map_err(|e| format!("Kho bị hỏng: {e}"))?;
        let name = String::from_utf8(name).map_err(|e| format!("Tên file trong kho sai: {e}"))?;
        let raw_len = read_u64(&mut cur)?;
        let comp_len = read_u64(&mut cur)?;

        let start = cur.position() as usize;
        let end = start
            .checked_add(comp_len as usize)
            .filter(|e| *e <= ARCHIVE.len())
            .ok_or_else(|| "Kho bị hỏng (độ dài entry vượt quá dữ liệu)".to_string())?;

        if only.map(|o| o == name).unwrap_or(true) {
            write_entry(root, &name, raw_len, &ARCHIVE[start..end])?;
        }
        cur.set_position(end as u64);
    }
    Ok(())
}

fn write_entry(root: &Path, name: &str, raw_len: u64, comp: &[u8]) -> Result<(), String> {
    let dest = root.join(name);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Không tạo được {}: {e}", parent.display()))?;
    }
    let tmp = PathBuf::from(format!("{}.part", dest.to_string_lossy()));

    // Đã có đúng file (vd. WebView2Loader.dll vừa giải nén và đang được nạp) → bỏ qua.
    // Không ghi đè DLL đang bị Windows khoá, tránh làm hỏng cả quá trình giải nén.
    if dest.metadata().map(|m| m.len() == raw_len).unwrap_or(false) {
        let _ = fs::remove_file(&tmp);
        return Ok(());
    }

    let mut dec = DeflateDecoder::new(comp);
    let mut out = File::create(&tmp).map_err(|e| format!("Không ghi được {}: {e}", tmp.display()))?;
    let written = std::io::copy(&mut dec, &mut out).map_err(|e| format!("Giải nén {name} lỗi: {e}"))?;
    out.flush().ok();
    drop(out);

    if written != raw_len {
        let _ = fs::remove_file(&tmp);
        return Err(format!("Giải nén {name} sai kích thước ({written}/{raw_len})"));
    }
    // File cũ có thể đang bị khoá → báo lỗi rõ ràng thay vì im lặng.
    let _ = fs::remove_file(&dest);
    fs::rename(&tmp, &dest).map_err(|e| format!("Không thay được {}: {e}", dest.display()))?;
    Ok(())
}
