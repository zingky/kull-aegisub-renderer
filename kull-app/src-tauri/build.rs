//! Đóng gói `bin/` + `WebView2Loader.dll` thành một kho nén duy nhất để nhúng
//! thẳng vào file .exe (include_bytes!). Nhờ vậy bản phát hành chỉ có 1 file exe:
//! lần đầu chạy app tự giải nén ra `%LOCALAPPDATA%\Kull Aegisub Renderer`.
//!
//! Định dạng kho (little-endian), ghi tuần tự:
//!   "KULLA001" | u32 số entry | { u16 tên, tên UTF-8, u64 raw_len, u64 comp_len, deflate }

use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use flate2::write::DeflateEncoder;
use flate2::Compression;

fn main() {
    tauri_build::build();

    if let Err(e) = pack_assets() {
        panic!("Không đóng gói được bin/ vào exe: {e}");
    }
}

fn pack_assets() -> Result<(), Box<dyn std::error::Error>> {
    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR")?);
    let repo = manifest
        .parent()
        .and_then(|p| p.parent())
        .ok_or("Không tìm thấy thư mục gốc dự án")?
        .to_path_buf();
    let bin = repo.join("bin");
    let webview2 = repo.join("WebView2Loader.dll");
    let assets_dir = manifest.join("assets");
    let archive = assets_dir.join("kull_assets.bin");

    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed={}", bin.display());
    println!("cargo:rerun-if-changed={}", webview2.display());

    let mut files: Vec<(String, PathBuf)> = Vec::new();
    collect(&bin, "bin", &mut files)?;
    files.sort_by(|a, b| a.0.cmp(&b.0));
    if webview2.exists() {
        files.push(("WebView2Loader.dll".to_string(), webview2.clone()));
    }

    let required = [
        "bin/ffmpeg.exe",
        "bin/ffprobe.exe",
        "bin/AviSynth.dll",
        "bin/VSFilter.dll",
        "bin/VSFilterMod.dll",
        "bin/avsplugins/DirectShowSource.dll",
        "WebView2Loader.dll",
    ];
    for name in required {
        if !files.iter().any(|(n, _)| n == name) {
            return Err(format!("thiếu file bắt buộc: {}", repo.join(name).display()).into());
        }
    }

    // Chỉ đóng gói lại khi bin/ hoặc DLL mới hơn kho hiện có.
    let newest = files
        .iter()
        .filter_map(|(_, p)| fs::metadata(p).ok()?.modified().ok())
        .max()
        .unwrap_or(SystemTime::UNIX_EPOCH);
    if let Ok(meta) = fs::metadata(&archive) {
        if let Ok(built) = meta.modified() {
            if built >= newest && meta.len() > 0 {
                return Ok(());
            }
        }
    }

    fs::create_dir_all(&assets_dir)?;
    let tmp = assets_dir.join("kull_assets.bin.tmp");
    let mut total_raw: u64 = 0;
    let mut total_comp: u64 = 0;
    {
        let mut out = BufWriter::new(File::create(&tmp)?);
        out.write_all(b"KULLA001")?;
        out.write_all(&(files.len() as u32).to_le_bytes())?;
        for (name, path) in &files {
            let raw = fs::read(path)?;
            let mut enc = DeflateEncoder::new(Vec::new(), Compression::best());
            enc.write_all(&raw)?;
            let comp = enc.finish()?;
            out.write_all(&(name.len() as u16).to_le_bytes())?;
            out.write_all(name.as_bytes())?;
            out.write_all(&(raw.len() as u64).to_le_bytes())?;
            out.write_all(&(comp.len() as u64).to_le_bytes())?;
            out.write_all(&comp)?;
            total_raw += raw.len() as u64;
            total_comp += comp.len() as u64;
        }
        out.flush()?;
    }
    let _ = fs::remove_file(&archive);
    fs::rename(&tmp, &archive)?;

    println!(
        "cargo:warning=Đã nhúng {} file vào exe: {:.1} MB -> {:.1} MB",
        files.len(),
        total_raw as f64 / 1_048_576.0,
        total_comp as f64 / 1_048_576.0
    );
    Ok(())
}

fn collect(dir: &Path, prefix: &str, out: &mut Vec<(String, PathBuf)>) -> std::io::Result<()> {
    if !dir.exists() {
        return Ok(());
    }
    let mut entries: Vec<_> = fs::read_dir(dir)?.filter_map(|e| e.ok()).collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let path = entry.path();
        let name = format!("{}/{}", prefix, entry.file_name().to_string_lossy());
        if path.is_dir() {
            collect(&path, &name, out)?;
        } else {
            out.push((name.replace('\\', "/"), path));
        }
    }
    Ok(())
}
