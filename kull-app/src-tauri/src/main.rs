// Bản phát hành là app GUI: không mở cửa sổ console nào khi chạy.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod assets;
mod wv2;

use kull_engine::{
    events::{RenderEvent, RenderEvents},
    path::{resolve_bin_dir, Binaries},
    subtitle::SubtitleEngine,
    types::{Hardware, Lang, OutputFormat, QualityPreset},
    RenderEngine,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::Emitter;

pub struct AppState {
    pub engine: tokio::sync::Mutex<Option<Arc<RenderEngine>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self { engine: tokio::sync::Mutex::new(None) }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BinariesJson {
    pub bin_dir: String,
    pub ffmpeg: bool,
    pub ffprobe: bool,
    pub vsfilter: bool,
    pub vsfiltermod: bool,
    pub avisynth: bool,
}

impl From<&Binaries> for BinariesJson {
    fn from(b: &Binaries) -> Self {
        Self {
            bin_dir: b.bin_dir.to_string_lossy().to_string(),
            ffmpeg: b.ffmpeg.is_some(),
            ffprobe: b.ffprobe.is_some(),
            vsfilter: b.vsfilter.is_some(),
            vsfiltermod: b.vsfiltermod.is_some(),
            avisynth: b.avisynth.is_some(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RenderOptionsJson {
    pub main_video: String,
    pub subtitle: Option<String>,
    pub intro: Option<String>,
    pub outro: Option<String>,
    pub engine: String,
    pub hardware: String,
    pub quality: String,
    pub custom: Option<Value>,
    pub merge_enabled: bool,
    pub fade_enabled: bool,
    pub fade_ms: u32,
    pub output_dir: String,
    pub output_name: String,
    pub output_format: String,
    pub lang: String,
    pub trim: Value,
}

impl TryFrom<RenderOptionsJson> for kull_engine::types::RenderOptions {
    type Error = String;
    fn try_from(j: RenderOptionsJson) -> Result<Self, Self::Error> {
        let engine = match j.engine.as_str() {
            "libass" => SubtitleEngine::Libass,
            "vsfiltermod" => SubtitleEngine::Vsfiltermod,
            "vsfilter" => SubtitleEngine::Vsfilter,
            _ => return Err(format!("engine không hợp lệ: {}", j.engine)),
        };
        let hardware = match j.hardware.as_str() {
            "nvenc" => Hardware::Nvenc,
            "qsv" => Hardware::Qsv,
            "amf" => Hardware::Amf,
            "cpu" => Hardware::Cpu,
            _ => Hardware::Auto,
        };
        let quality = match j.quality.as_str() {
            "original" => QualityPreset::Original,
            "high" => QualityPreset::High,
            "balanced" => QualityPreset::Balanced,
            "small" => QualityPreset::Small,
            "custom" => QualityPreset::Custom,
            _ => QualityPreset::Original,
        };
        let output_format = match j.output_format.as_str() {
            "mkv" => OutputFormat::Mkv,
            "webm" => OutputFormat::Webm,
            _ => OutputFormat::Mp4,
        };
        let lang = match j.lang.as_str() { "en" => Lang::En, _ => Lang::Vi };
        let custom = j.custom.as_ref().and_then(|v| serde_json::from_value::<CustomQualityJson>(v.clone()).ok());
        let trim = serde_json::from_value::<TrimJson>(j.trim).unwrap_or_default();
        Ok(kull_engine::types::RenderOptions {
            main_video: j.main_video,
            subtitle: j.subtitle,
            intro: j.intro,
            outro: j.outro,
            engine,
            hardware,
            quality,
            custom: custom.map(|c| kull_engine::types::CustomQuality {
                resolution: c.resolution, fps: c.fps, bitrate: c.bitrate,
            }),
            merge_enabled: j.merge_enabled,
            fade: kull_engine::types::Fades { enabled: j.fade_enabled, duration_ms: j.fade_ms },
            output_dir: j.output_dir,
            output_name: j.output_name,
            output_format,
            lang,
            trim: kull_engine::types::Trim { enabled: trim.enabled, start: trim.start, end: trim.end },
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CustomQualityJson { resolution: String, fps: String, bitrate: String }

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct TrimJson { enabled: bool, start: f64, end: f64 }

#[tauri::command]
async fn init(
    state: tauri::State<'_, AppState>,
    resources_path: Option<String>,
    project_root: Option<String>,
) -> Result<BinariesJson, String> {
    // Lần chạy đầu của bản 1-file-exe: giải nén ffmpeg/ffprobe/DLL (chỉ 1 lần).
    let prepared = tauri::async_runtime::spawn_blocking(assets::ensure_bin_assets).await;
    let prep_err = match prepared {
        Ok(Ok(_)) => None,
        Ok(Err(e)) => Some(e),
        Err(e) => Some(format!("Tác vụ giải nén bị lỗi: {e}")),
    };
    if let Some(e) = prep_err {
        rfd::MessageDialog::new()
            .set_level(rfd::MessageLevel::Error)
            .set_title("Kull Aegisub Renderer")
            .set_description(format!(
                "Không chuẩn bị được ffmpeg/ffprobe đi kèm:\n\n{e}\n\nApp vẫn mở nhưng sẽ chưa render được."
            ))
            .show();
    }

    let project_root = PathBuf::from(
        project_root
            .unwrap_or_else(|| std::env::current_dir().map(|p| p.to_string_lossy().to_string()).unwrap_or_default()),
    );
    let bin_dir = resolve_bin_dir(resources_path.as_deref(), &project_root);
    let binaries = Binaries::check(&bin_dir);
    let engine = RenderEngine::new(binaries.clone(), kull_engine::i18n::Dictionary::new());
    let mut g = state.engine.lock().await;
    *g = Some(Arc::new(engine));
    Ok(BinariesJson::from(&binaries))
}

#[tauri::command]
async fn check_bin(state: tauri::State<'_, AppState>) -> Result<BinariesJson, String> {
    let g = state.engine.lock().await;
    match g.as_ref() {
        Some(e) => Ok(BinariesJson::from(&e.binaries)),
        None => Err("Chưa khởi tạo engine. Gọi init() trước.".into()),
    }
}

#[tauri::command]
async fn probe_media(
    state: tauri::State<'_, AppState>,
    file_path: String,
    lang: String,
) -> Result<kull_engine::types::MediaMeta, String> {
    let g = state.engine.lock().await;
    let e = g.as_ref().ok_or("Chưa khởi tạo engine")?;
    let _l = if lang == "en" { Lang::En } else { Lang::Vi };
    kull_engine::probe::probe_media(&e.ffprobe, &file_path, _l, &e.dict)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn detect_encoders(state: tauri::State<'_, AppState>) -> Result<Vec<String>, String> {
    let g = state.engine.lock().await;
    let e = g.as_ref().ok_or("Chưa khởi tạo engine")?;
    let available = kull_engine::encoder::detect_encoders(&e.ffmpeg).await;
    Ok(available.iter().map(|h| h.as_str().to_string()).collect())
}

#[tauri::command]
fn select_file(title: Option<String>, filter: Option<String>) -> Result<Option<String>, String> {
    let mut builder = rfd::FileDialog::new();
    builder = builder.set_title(title.as_deref().unwrap_or("Chọn file"));
    if let Some(f) = filter {
        for ext in f.split(',') {
            let ext = ext.trim();
            if ext == "*" {
                builder = builder.add_filter("Tất cả file", &["*"]);
            } else {
                builder = builder.add_filter(ext, &[ext]);
            }
        }
    }
    Ok(builder.pick_file().map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn select_dir(lang: String) -> Result<Option<String>, String> {
    let _ = lang;
    Ok(rfd::FileDialog::new().pick_folder().map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn open_folder(dir_path: String) -> Result<bool, String> {
    if std::path::Path::new(&dir_path).exists() {
        match std::process::Command::new("explorer").arg(&dir_path).spawn() {
            Ok(_) => Ok(true),
            Err(e) => Err(format!("Không mở được thư mục: {}", e)),
        }
    } else {
        Err(format!("Không mở được thư mục: {}", dir_path))
    }
}

#[tauri::command]
async fn start_trim(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    main_video: String,
    output_path: String,
    start: f64,
    end: f64,
    lang: String,
) -> Result<(), String> {
    let engine = {
        let g = state.engine.lock().await;
        match g.as_ref() {
            Some(e) => Arc::clone(e),
            None => return Err("Chưa khởi tạo engine".into()),
        }
    };
    let l = if lang == "en" { Lang::En } else { Lang::Vi };
    if let Some(dir) = Path::new(&output_path).parent() {
        if !dir.as_os_str().is_empty() {
            let _ = std::fs::create_dir_all(dir);
        }
    }

    // Kênh riêng cho xuất clip: KHÔNG làm ảnh hưởng trạng thái render chính
    let (events, mut rx) = RenderEvents::channel();
    let app_h = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(ev) = rx.recv().await {
            let _ = app_h.emit("trim:event", &ev);
        }
    });

    match kull_engine::render::trim_video(
        &engine.ffmpeg,
        &engine.ffprobe,
        &main_video,
        &output_path,
        start,
        end,
        l,
        &engine.dict,
        &events,
    )
    .await
    {
        Ok(_) => Ok(()),
        Err(err) => {
            let msg = err.to_string();
            events.send(RenderEvent::Error(err));
            Err(msg)
        }
    }
}

#[tauri::command]
async fn start_render(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    options: RenderOptionsJson,
) -> Result<(), String> {
    let engine = {
        let g = state.engine.lock().await;
        match g.as_ref() {
            Some(e) => Arc::clone(e),
            None => return Err("Chưa khởi tạo engine".into()),
        }
    };
    let options: kull_engine::types::RenderOptions = options.try_into().map_err(|e: String| e.to_string())?;
    if options.main_video.trim().is_empty() {
        return Err("Thiếu video chính (mainVideo)".into());
    }
    if options.output_name.trim().is_empty() {
        return Err("Thiếu tên file xuất (outputName)".into());
    }
    if !options.output_dir.trim().is_empty() {
        let _ = std::fs::create_dir_all(&options.output_dir);
    }

    // Kênh sự kiện: engine → UI (log / tiến độ / done / error)
    let (events, mut rx) = RenderEvents::channel();
    let app_h = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(ev) = rx.recv().await {
            let _ = app_h.emit("render:event", &ev);
        }
    });

    // Chạy render ở task riêng để lệnh trả về ngay (UI hiện tiến độ).
    tauri::async_runtime::spawn(async move {
        if let Err(err) = engine.start_render(options, events.clone()).await {
            // Luôn đẩy lỗi về UI — trước đây lỗi bị bỏ im lặng nên UI kẹt 0%.
            events.send(RenderEvent::Error(err));
        }
    });
    Ok(())
}

#[tauri::command]
async fn cancel_render(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let g = state.engine.lock().await;
    match g.as_ref() {
        Some(e) => {
            e.cancel_render().await;
            Ok(())
        }
        None => Err("Chưa khởi tạo engine".into()),
    }
}

#[tauri::command]
async fn extract_thumbs(
    state: tauri::State<'_, AppState>,
    video_path: String,
    count: Option<usize>,
) -> Result<Value, String> {
    let g = state.engine.lock().await;
    let e = g.as_ref().ok_or("Chưa khởi tạo engine")?;
    match kull_engine::render::extract_thumbs(&e.ffmpeg, &e.ffprobe, &video_path, count.unwrap_or(12)).await {
        Ok((thumbs, dir)) => {
            let list: Vec<Value> = thumbs
                .iter()
                .map(|(t, f)| serde_json::json!({ "t": t, "file": f.to_string_lossy() }))
                .collect();
            Ok(serde_json::json!({ "thumbs": list, "dir": dir.to_string_lossy() }))
        }
        Err(err) => Ok(serde_json::json!({ "thumbs": [], "dir": "", "error": err.to_string() })),
    }
}

#[tauri::command]
async fn render_preview_frame(
    state: tauri::State<'_, AppState>,
    video_path: String,
    sub_path: Option<String>,
    time_sec: f64,
    engine: Option<String>,
) -> Result<Value, String> {
    let _ = engine;
    let g = state.engine.lock().await;
    let e = g.as_ref().ok_or("Chưa khởi tạo engine")?;
    match kull_engine::render::render_preview_frame(&e.ffmpeg, &video_path, sub_path.as_deref(), time_sec).await {
        Ok(p) => Ok(serde_json::json!({
            "ok": true,
            "path": p.to_string_lossy(),
            "engine": "libass",
            "fn": "libass"
        })),
        Err(err) => Ok(serde_json::json!({ "ok": false, "error": err.to_string() })),
    }
}

#[tauri::command]
fn subtitle_info(path: String) -> Result<Value, String> {
    kull_engine::subtitle::subtitle_info(&path)
        .map(|i| serde_json::to_value(i).unwrap_or(Value::Null))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn cleanup_thumbs(dir: String) -> Result<(), String> {
    if !dir.is_empty() {
        let _ = std::fs::remove_dir_all(dir);
    }
    Ok(())
}

#[tauri::command]
fn get_app_version() -> Result<String, String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

fn main() {
    // WebView2 cần loader ngay khi tạo cửa sổ → giải nén DLL nhỏ này trước.
    if let Err(e) = assets::ensure_webview2_dll() {
        rfd::MessageDialog::new()
            .set_level(rfd::MessageLevel::Error)
            .set_title("Kull Aegisub Renderer")
            .set_description(format!("Không chuẩn bị được WebView2Loader.dll:\n\n{e}"))
            .show();
    }

    tauri::Builder::default()
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            init,
            check_bin,
            probe_media,
            detect_encoders,
            select_file,
            select_dir,
            open_folder,
            start_render,
            start_trim,
            extract_thumbs,
            subtitle_info,
            cleanup_thumbs,
            render_preview_frame,
            cancel_render,
            get_app_version,
        ])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("Lỗi khi chạy Kull Aegisub Renderer (Tauri).");
}

