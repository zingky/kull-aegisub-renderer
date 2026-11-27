use crate::error::EngineError;
use crate::i18n::{Dictionary, Lang};
use crate::path::{escape_filter_path, Binaries, remove_file_ignore};
pub use crate::types::SubtitleEngine;
use std::path::{Path, PathBuf};
use tokio::process::Command;

/// Kết quả kế hoạch phụ đề: libass (native) hoặc AVS (AviSynth + VSFilter).
#[derive(Debug, Clone)]
pub enum SubtitlePlanType {
    Libass { filter: String },
    Avs {
        dll: PathBuf,
        dll_name: String,
        fn_name: String,
        avs_path: PathBuf,
    },
}

#[derive(Debug, Clone)]
pub struct SubtitlePlan {
    pub plan_type: SubtitlePlanType,
    pub note: Option<String>,
    pub warning: Option<String>,
}

/// Tên hàm TextSub chính của DLL theo bản build (VSFilterMod → TextSubMod).
pub fn avs_sub_fn_name(dll_path: &Path) -> &'static str {
    if dll_path.file_name().and_then(|n| n.to_str()).map(|n| n.to_lowercase().contains("vsfiltermod")).unwrap_or(false) {
        "TextSubMod"
    } else {
        "TextSub"
    }
}

/// Tên hàm còn lại (dùng khi DLL không có hàm chính — bản build lạ).
pub fn avs_sub_fn_alt(dll_path: &Path) -> &'static str {
    if avs_sub_fn_name(dll_path) == "TextSubMod" { "TextSub" } else { "TextSubMod" }
}

/// Sinh script .avs tạm và ghi ra %TEMP%.
pub fn create_avs_script(
    main_video: &str,
    subtitle_path: &str,
    dll_path: &Path,
    fps: f64,
    fn_name: &str,
    tmp_dir: &Path,
) -> Result<PathBuf, std::io::Error> {
    let to_fwd = |p: &str| p.replace('\\', "/");
    let dll_str = dll_path.to_str().unwrap_or("");
    let mut lines: Vec<String> = Vec::new();
    lines.push(r#"SetFilterMTMode("DEFAULT_MT_MODE", 2)"#.to_string());
    lines.push(format!(r#"LoadPlugin("{}")"#, to_fwd(dll_str)));
    let dss = dll_path.parent().and_then(|p| p.parent()).map(|p| p.join("avsplugins/DirectShowSource.dll"));
    if let Some(dss) = dss.filter(|p| p.exists()) {
        lines.push(format!(r#"LoadPlugin("{}")"#, to_fwd(dss.to_str().unwrap_or(""))));
    }
    lines.push(format!(r#"DirectShowSource("{}", fps={:.3}, convertfps=true)"#, to_fwd(main_video), fps));
    lines.push(format!(r#"{}("{}")"#, fn_name, to_fwd(subtitle_path)));
    let content = lines.join("\r\n");
    let rand: u64 = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let tmp_path = tmp_dir.join(format!("kull_vietsub_{}_{}.avs", rand, fastrand_u32()));
    std::fs::write(&tmp_path, content)?;
    Ok(tmp_path)
}

/// Preflight: thử đọc .avs + xuất 1 frame — xác nhận DLL có TextSub & decode được video.
pub async fn preflight_avs(ffmpeg_path: &str, avs_path: &Path) -> bool {
    let mut preflight = Command::new(ffmpeg_path);
    preflight
        .args([
            "-hide_banner", "-loglevel", "error",
            "-i", avs_path.to_str().unwrap_or(""),
            "-frames:v", "1",
            "-f", "null", "-",
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    crate::win::hide_console(&mut preflight);
    let Ok(child) = preflight.spawn() else {
        return false;
    };
    let mut child = child;
    let res = tokio::time::timeout(std::time::Duration::from_secs(30), async {
        child.wait().await
    }).await;
    match res {
        Ok(Ok(status)) => status.success(),
        _ => {
            let _ = child.kill().await;
            false
        }
    }
}

/// Xây kế hoạch phụ đề (port từ `buildSubtitlePlan`).
pub async fn build_subtitle_plan(
    engine: SubtitleEngine,
    subtitle: Option<&str>,
    main_video: &str,
    fps: f64,
    binaries: &Binaries,
    dict: &Dictionary,
    lang: Lang,
) -> Result<SubtitlePlan, EngineError> {
    let t = |key: &str, vars: &[(&str, &str)]| dict.translate(lang, key, vars);

    if engine != SubtitleEngine::Libass {
        let tmp_dir = std::env::temp_dir();
        let dlls: Vec<&PathBuf> = match engine {
            SubtitleEngine::Vsfilter => {
                let mut v = Vec::new();
                if let Some(d) = &binaries.vsfilter { v.push(d); }
                if let Some(d) = &binaries.vsfiltermod { v.push(d); }
                v
            }
            SubtitleEngine::Vsfiltermod => {
                let mut v = Vec::new();
                if let Some(d) = &binaries.vsfiltermod { v.push(d); }
                if let Some(d) = &binaries.vsfilter { v.push(d); }
                v
            }
            _ => Vec::new(),
        };
        let ffmpeg = match binaries.ffmpeg_path() {
            Some(p) => p,
            None => return Ok(SubtitlePlan {
                plan_type: SubtitlePlanType::Libass { filter: format!("subtitles='{}'", escape_filter_path(subtitle.unwrap_or(""))) },
                note: None,
                warning: Some(t("eng.warn_no_avisynth", &[])),
            }),
        };
        for dll in dlls {
            for fn_name in [avs_sub_fn_name(dll), avs_sub_fn_alt(dll)] {
                let sub = match subtitle { Some(s) => s, None => continue };
                match create_avs_script(main_video, sub, dll, fps, fn_name, &tmp_dir) {
                    Ok(avs_path) => {
                        if preflight_avs(ffmpeg.to_str().unwrap_or("ffmpeg"), &avs_path).await {
                            let dll_name = dll.file_name().unwrap_or_default().to_string_lossy().to_string();
                            let preferred = match engine {
                                SubtitleEngine::Vsfilter => "VSFilter.dll",
                                SubtitleEngine::Vsfiltermod => "VSFilterMod.dll",
                                _ => "",
                            };
                            let note = if dll_name == preferred { None } else {
                                Some(t("eng.swap_note", &[("preferred", preferred), ("dll", &dll_name)]))
                            };
                            return Ok(SubtitlePlan {
                                plan_type: SubtitlePlanType::Avs { dll: dll.clone(), dll_name, fn_name: fn_name.to_string(), avs_path },
                                note,
                                warning: None,
                            });
                        }
                        remove_file_ignore(&avs_path);
                    }
                    Err(_) => continue,
                }
            }
        }
        return Ok(SubtitlePlan {
            plan_type: SubtitlePlanType::Libass { filter: format!("subtitles='{}'", escape_filter_path(subtitle.unwrap_or(""))) },
            note: None,
            warning: Some(t("eng.warn_no_plugin", &[])),
        });
    }

    // libass: filter subtitles nội bộ, path đã escape chuẩn Windows.
    let sub = subtitle.unwrap_or("");
    Ok(SubtitlePlan {
        plan_type: SubtitlePlanType::Libass { filter: format!("subtitles='{}'", escape_filter_path(sub)) },
        note: None,
        warning: None,
    })
}

/// Dọn file .avs tạm sau khi render xong.
pub fn cleanup_avs(avs_path: Option<&PathBuf>) {
    if let Some(p) = avs_path {
        remove_file_ignore(p);
    }
}

/// Hàm random nhỏ (tránh thêm dependency `rand`).
fn fastrand_u32() -> u32 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut s = DefaultHasher::new();
    std::time::SystemTime::now().hash(&mut s);
    s.finish() as u32
}

/// Thông tin chi tiết file phụ đề (.ass/.ssa/.srt/.vtt) để hiển thị trong UI.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleInfo {
    pub path: String,
    pub size_bytes: u64,
    pub encoding: String,
    pub format: String,
    pub lines: u32,
    pub dialogues: u32,
    pub comments: u32,
    pub styles: Vec<String>,
    pub fonts: Vec<String>,
    pub play_res_x: u32,
    pub play_res_y: u32,
    pub first_sec: f64,
    pub last_sec: f64,
}

fn decode_text(bytes: &[u8]) -> (String, String) {
    if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        let u16s: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        (String::from_utf16_lossy(&u16s), "UTF-16 LE".into())
    } else if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
        let u16s: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_be_bytes([c[0], c[1]]))
            .collect();
        (String::from_utf16_lossy(&u16s), "UTF-16 BE".into())
    } else if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        (String::from_utf8_lossy(&bytes[3..]).to_string(), "UTF-8 (BOM)".into())
    } else {
        match std::str::from_utf8(bytes) {
            Ok(s) => (s.to_string(), "UTF-8".into()),
            Err(_) => (String::from_utf8_lossy(bytes).to_string(), "ANSI / khác".into()),
        }
    }
}

fn parse_sub_time(s: &str) -> Option<f64> {
    let parts: Vec<&str> = s.trim().split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let h: f64 = parts[0].trim().parse().ok()?;
    let m: f64 = parts[1].trim().parse().ok()?;
    let sec: f64 = parts[2].trim().replace(',', ".").parse().ok()?;
    let v = h * 3600.0 + m * 60.0 + sec;
    if v.is_finite() {
        Some(v)
    } else {
        None
    }
}

/// Đọc + phân tích file phụ đề: số dòng, số thoại, style, font, khung thời gian…
pub fn subtitle_info(path: &str) -> Result<SubtitleInfo, EngineError> {
    let bytes = std::fs::read(path).map_err(|e| EngineError::Io { msg: format!("{}: {}", path, e) })?;
    let size_bytes = bytes.len() as u64;
    let (text, encoding) = decode_text(&bytes);
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let mut info = SubtitleInfo {
        path: path.to_string(),
        size_bytes,
        encoding,
        format: match ext.as_str() {
            "ass" => "ASS".into(),
            "ssa" => "SSA".into(),
            "srt" => "SRT".into(),
            "vtt" => "WebVTT".into(),
            _ => ext.to_uppercase(),
        },
        ..Default::default()
    };

    let mut first = f64::MAX;
    let mut last = 0.0f64;

    for raw in text.lines() {
        let line = raw.trim_end_matches('\r');
        if line.trim().is_empty() {
            continue;
        }
        info.lines += 1;
        let lower = line.to_ascii_lowercase();
        if lower.starts_with("playresx:") {
            info.play_res_x = line.split(':').nth(1).and_then(|v| v.trim().parse().ok()).unwrap_or(0);
        } else if lower.starts_with("playresy:") {
            info.play_res_y = line.split(':').nth(1).and_then(|v| v.trim().parse().ok()).unwrap_or(0);
        } else if lower.starts_with("style:") {
            // Style: Tên, Font, Size, ...
            let body = line.splitn(2, ':').nth(1).unwrap_or("").trim();
            let fields: Vec<&str> = body.split(',').collect();
            let name = fields.first().map(|s| s.trim()).unwrap_or("");
            let font = fields.get(1).map(|s| s.trim()).unwrap_or("");
            if !name.is_empty() && !info.styles.iter().any(|s| s == name) {
                info.styles.push(name.to_string());
            }
            if !font.is_empty() && !info.fonts.iter().any(|f| f == font) && info.fonts.len() < 12 {
                info.fonts.push(font.to_string());
            }
        } else if lower.starts_with("dialogue:") {
            info.dialogues += 1;
            let body = line.splitn(2, ':').nth(1).unwrap_or("").trim();
            let fields: Vec<&str> = body.split(',').collect();
            if let Some(s) = fields.get(1).and_then(|v| parse_sub_time(v)) {
                first = first.min(s);
            }
            if let Some(e) = fields.get(2).and_then(|v| parse_sub_time(v)) {
                last = last.max(e);
            }
        } else if lower.starts_with("comment:") {
            info.comments += 1;
        } else if line.contains("-->") {
            // SRT / WebVTT
            info.dialogues += 1;
            let mut it = line.split("-->");
            if let (Some(a), Some(b)) = (it.next(), it.next()) {
                if let Some(s) = parse_sub_time(a) {
                    first = first.min(s);
                }
                let end_tok = b.trim().split_whitespace().next().unwrap_or("");
                if let Some(e) = parse_sub_time(end_tok) {
                    last = last.max(e);
                }
            }
        }
    }

    if first != f64::MAX {
        info.first_sec = first.max(0.0);
    }
    info.last_sec = last;
    Ok(info)
}

