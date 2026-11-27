//! Smoke test thật cho 2 chức năng cốt lõi: đọc video (probe) và render video.
//! Chạy: cargo test -p kull-engine --test render_smoke -- --nocapture
//!
//! Test tự sinh video + phụ đề trong thư mục tạm bằng chính bin/ffmpeg của app,
//! nên không cần file mẫu. Bỏ qua (skip) nếu thiếu bin/.
#![allow(clippy::needless_return)]

use kull_engine::events::RenderEvent;
use kull_engine::events::RenderEvents;
use kull_engine::i18n::Dictionary;
use kull_engine::path::Binaries;
use kull_engine::probe::probe_media;
use kull_engine::types::{
    Fades, Hardware, Lang, OutputFormat, QualityPreset, RenderOptions, SubtitleEngine, Trim,
};
use kull_engine::RenderEngine;
use std::path::PathBuf;

fn repo_bin_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("repo root")
        .join("bin")
}

fn tmp_dir(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("kull_smoke_{}_{}", name, std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).expect("create temp dir");
    d
}

const ASS: &str = r#"[Script Info]
ScriptType: v4.00+
PlayResX: 320
PlayResY: 240
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,28,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.20,0:00:02.80,Default,,0,0,0,,Kull Aegisub Renderer smoke test
"#;

fn make_test_video_ex(
    ffmpeg: &str,
    out: &std::path::Path,
    secs: u32,
    size: &str,
    fps: u32,
    sample_rate: u32,
) {
    let src = format!("testsrc=size={}:rate={}", size, fps);
    let sine = format!("sine=frequency=440:sample_rate={}", sample_rate);
    let status = std::process::Command::new(ffmpeg)
        .args([
            "-hide_banner", "-loglevel", "error", "-y",
            "-f", "lavfi", "-i", &src,
            "-f", "lavfi", "-i", &sine,
            "-t", &secs.to_string(),
            "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k",
        ])
        .arg(out)
        .status()
        .expect("spawn ffmpeg to create test video");
    assert!(status.success(), "không tạo được video test");
}

fn make_test_video(ffmpeg: &str, out: &std::path::Path, secs: u32, size: &str) {
    make_test_video_ex(ffmpeg, out, secs, size, 30, 48000);
}

fn base_options(
    video: &std::path::Path,
    sub: &std::path::Path,
    dir: &std::path::Path,
    engine: SubtitleEngine,
    name: &str,
) -> RenderOptions {
    RenderOptions {
        main_video: video.to_string_lossy().to_string(),
        subtitle: Some(sub.to_string_lossy().to_string()),
        intro: None,
        outro: None,
        engine,
        hardware: Hardware::Cpu,
        quality: QualityPreset::Balanced,
        custom: None,
        merge_enabled: false,
        fade: Fades { enabled: true, duration_ms: 200 },
        output_dir: dir.to_string_lossy().to_string(),
        output_name: name.to_string(),
        output_format: OutputFormat::Mp4,
        lang: Lang::Vi,
        trim: Trim { enabled: false, start: 0.0, end: 0.0 },
    }
}

/// Chạy render, gom toàn bộ sự kiện. Trả (kết quả, số event tiến độ, pct cuối, có mốc giữa).
async fn run_and_collect(
    engine: std::sync::Arc<RenderEngine>,
    opts: RenderOptions,
) -> (Result<kull_engine::events::RenderOutcome, String>, usize, f64, bool) {
    let (events, mut rx) = RenderEvents::channel();
    let ev2 = events.clone();
    let handle = tokio::spawn(async move { engine.start_render(opts, ev2).await });
    drop(events);
    let mut progress_count = 0usize;
    let mut last_pct = 0.0f64;
    let mut saw_mid = false;
    while let Some(ev) = rx.recv().await {
        match ev {
            RenderEvent::Progress(p) => {
                progress_count += 1;
                last_pct = p.pct;
                if p.pct > 1.0 && p.pct < 95.0 {
                    saw_mid = true;
                }
            }
            RenderEvent::Log { level, message } => println!("  [{:?}] {}", level, message),
            RenderEvent::Error(e) => println!("  [ERROR] {}", e),
            RenderEvent::Done(_) => {}
        }
    }
    let res = handle.await.expect("join render task").map_err(|e| e.to_string());
    (res, progress_count, last_pct, saw_mid)
}

#[tokio::test]
async fn probe_and_render_libass() {
    let bin = Binaries::check(&repo_bin_dir());
    let (Some(ffmpeg), Some(ffprobe)) = (bin.ffmpeg.clone(), bin.ffprobe.clone()) else {
        eprintln!("SKIP: thiếu bin/ffmpeg.exe hoặc bin/ffprobe.exe");
        return;
    };
    let ffmpeg = ffmpeg.to_string_lossy().to_string();
    let ffprobe = ffprobe.to_string_lossy().to_string();
    let dir = tmp_dir("libass");
    let video = dir.join("in.mp4");
    let sub = dir.join("in.ass");
    std::fs::write(&sub, ASS).unwrap();
    make_test_video(&ffmpeg, &video, 3, "320x240");

    // 1) Probe phải trả thông số đúng
    let meta = probe_media(&ffprobe, video.to_str().unwrap(), Lang::Vi, &Dictionary::new())
        .await
        .expect("probe thất bại");
    println!(
        "probe: {}x{} @ {}fps, {}s, bitrate {}kbps",
        meta.width, meta.height, meta.fps, meta.duration, meta.bitrate_avg_kbps
    );
    assert_eq!((meta.width, meta.height), (320, 240));
    assert!((meta.fps - 30.0).abs() < 0.1);
    assert!((meta.duration - 3.0).abs() < 0.5);
    assert!(meta.has_audio);

    // 2) Render bằng libass
    let engine = std::sync::Arc::new(RenderEngine::new(bin.clone(), Dictionary::new()));
    let opts = base_options(&video, &sub, &dir, SubtitleEngine::Libass, "out_libass");
    let (res, progress_count, last_pct, _mid) = run_and_collect(engine.clone(), opts).await;
    res.expect("render libass thất bại");
    let out = dir.join("out_libass.mp4");
    assert!(out.exists(), "không có file xuất: {:?}", out);
    assert!(std::fs::metadata(&out).map(|m| m.len() > 1024).unwrap_or(false));
    println!("libass: {} event tiến độ, pct cuối = {:.1}", progress_count, last_pct);
    assert!(progress_count > 0, "không nhận được event tiến độ nào");
    assert!(last_pct > 50.0, "tiến độ cuối quá thấp: {}", last_pct);
}

#[tokio::test]
async fn render_vsfiltermod_if_available() {
    let bin = Binaries::check(&repo_bin_dir());
    let Some(ffmpeg) = bin.ffmpeg.clone() else {
        eprintln!("SKIP: thiếu bin/");
        return;
    };
    if bin.vsfiltermod.is_none() || bin.avisynth.is_none() {
        eprintln!("SKIP: thiếu VSFilterMod.dll / AviSynth.dll");
        return;
    }
    let ffmpeg = ffmpeg.to_string_lossy().to_string();
    let dir = tmp_dir("vsfilter");
    let video = dir.join("in.mp4");
    let sub = dir.join("in.ass");
    std::fs::write(&sub, ASS).unwrap();
    make_test_video(&ffmpeg, &video, 3, "320x240");

    let engine = std::sync::Arc::new(RenderEngine::new(bin.clone(), Dictionary::new()));
    let opts = base_options(&video, &sub, &dir, SubtitleEngine::Vsfiltermod, "out_vsf");
    let (res, progress_count, last_pct, _mid) = run_and_collect(engine.clone(), opts).await;
    res.expect("render VSFilterMod thất bại");
    let out = dir.join("out_vsf.mp4");
    assert!(out.exists(), "không có file xuất VSFilterMod");
    println!("vsfiltermod: {} event tiến độ, pct cuối = {:.1}", progress_count, last_pct);
}

#[tokio::test]
async fn progress_events_stream_during_render() {
    let bin = Binaries::check(&repo_bin_dir());
    let Some(ffmpeg) = bin.ffmpeg.clone() else {
        eprintln!("SKIP: thiếu bin/ffmpeg.exe");
        return;
    };
    let ffmpeg = ffmpeg.to_string_lossy().to_string();
    let dir = tmp_dir("progress");
    let video = dir.join("in.mp4");
    let sub = dir.join("in.ass");
    std::fs::write(&sub, ASS).unwrap();
    make_test_video(&ffmpeg, &video, 20, "1280x720");

    let engine = std::sync::Arc::new(RenderEngine::new(bin.clone(), Dictionary::new()));
    let mut opts = base_options(&video, &sub, &dir, SubtitleEngine::Libass, "out_progress");
    opts.quality = QualityPreset::Original; // preset slow -> render đủ lâu để thấy nhiều mốc
    opts.fade.enabled = false;
    let (res, count, last_pct, mid) = run_and_collect(engine.clone(), opts).await;
    res.expect("render test tiến độ thất bại");
    println!("progress: {} event, pct cuối {:.1}, có mốc giữa = {}", count, last_pct, mid);
    assert!(count >= 2, "chỉ nhận {} event tiến độ", count);
    assert!(mid, "không có mốc tiến độ nào giữa 1%..95% — tiến độ chỉ cập nhật khi render xong");
}

#[tokio::test]
async fn thumbs_and_preview_frame() {
    let bin = Binaries::check(&repo_bin_dir());
    let (Some(ffmpeg), Some(ffprobe)) = (bin.ffmpeg.clone(), bin.ffprobe.clone()) else {
        eprintln!("SKIP: thiếu bin/");
        return;
    };
    let ffmpeg = ffmpeg.to_string_lossy().to_string();
    let ffprobe = ffprobe.to_string_lossy().to_string();
    let dir = tmp_dir("thumbs");
    let video = dir.join("in.mp4");
    let sub = dir.join("in.ass");
    std::fs::write(&sub, ASS).unwrap();
    make_test_video(&ffmpeg, &video, 4, "640x360");

    let (thumbs, _tdir) = kull_engine::render::extract_thumbs(&ffmpeg, &ffprobe, video.to_str().unwrap(), 6)
        .await
        .expect("extract_thumbs lỗi");
    println!("thumbs: {}", thumbs.len());
    assert!(thumbs.len() >= 4, "quá ít thumbnail: {}", thumbs.len());
    for (_, f) in &thumbs {
        assert!(f.exists() && std::fs::metadata(f).map(|m| m.len() > 0).unwrap_or(false), "thumbnail rỗng: {:?}", f);
    }

    let frame = kull_engine::render::render_preview_frame(&ffmpeg, video.to_str().unwrap(), Some(sub.to_str().unwrap()), 1.0)
        .await
        .expect("render_preview_frame lỗi");
    println!("preview frame: {:?}", frame);
    assert!(frame.exists());
}

#[tokio::test]
async fn concat_intro_outro_with_dotted_name() {
    let bin = Binaries::check(&repo_bin_dir());
    let (Some(ffmpeg), Some(ffprobe)) = (bin.ffmpeg.clone(), bin.ffprobe.clone()) else {
        eprintln!("SKIP: thiếu bin/");
        return;
    };
    let ffmpeg = ffmpeg.to_string_lossy().to_string();
    let ffprobe = ffprobe.to_string_lossy().to_string();
    let dir = tmp_dir("concat");
    let intro = dir.join("intro.mp4");
    let video = dir.join("main.mp4");
    let outro = dir.join("outro.mp4");
    let sub = dir.join("in.ass");
    std::fs::write(&sub, ASS).unwrap();

    // Cố tình khác resolution / fps / sample rate để kiểm tra chuẩn hoá của concat
    make_test_video_ex(&ffmpeg, &intro, 2, "320x240", 30, 44100);
    make_test_video_ex(&ffmpeg, &video, 3, "640x360", 24, 48000);
    make_test_video_ex(&ffmpeg, &outro, 2, "480x270", 25, 44100);

    let engine = std::sync::Arc::new(RenderEngine::new(bin.clone(), Dictionary::new()));
    // Tên file có dấu chấm + ngoặc vuông — đúng ca lỗi "mất đầu tên file xuất"
    let name = "East Of Eden [Full Ver.] main_exported";
    let mut opts = base_options(&video, &sub, &dir, SubtitleEngine::Libass, name);
    opts.merge_enabled = true;
    opts.intro = Some(intro.to_string_lossy().to_string());
    opts.outro = Some(outro.to_string_lossy().to_string());
    opts.fade.enabled = true;
    opts.fade.duration_ms = 300;

    let (res, count, last_pct, _mid) = run_and_collect(engine.clone(), opts).await;
    res.expect("render ghép Intro/Outro thất bại");

    let out = dir.join(format!("{}.mp4", name));
    assert!(out.exists(), "không có file xuất (tên bị cắt?): {:?}", out);
    assert!(std::fs::metadata(&out).map(|m| m.len() > 1024).unwrap_or(false));

    let m = probe_media(&ffprobe, out.to_str().unwrap(), Lang::Vi, &Dictionary::new())
        .await
        .expect("probe file ghép thất bại");
    println!(
        "concat: {}x{} @ {:.2}fps, {:.2}s, audio={}, {} event tiến độ, pct cuối {:.1}",
        m.width, m.height, m.fps, m.duration, m.has_audio, count, last_pct
    );
    assert_eq!((m.width, m.height), (640, 360), "độ phân giải phải theo video chính");
    assert!(m.has_audio, "file ghép bị mất audio");
    assert!(
        (m.duration - 7.0).abs() < 1.0,
        "thời lượng phải ~7s (2+3+2), nhận {:.2}s",
        m.duration
    );
}

#[tokio::test]
async fn trim_keeps_audio_and_reports_progress() {
    let bin = Binaries::check(&repo_bin_dir());
    let (Some(ffmpeg), Some(ffprobe)) = (bin.ffmpeg.clone(), bin.ffprobe.clone()) else {
        eprintln!("SKIP: thiếu bin/");
        return;
    };
    let ffmpeg = ffmpeg.to_string_lossy().to_string();
    let ffprobe = ffprobe.to_string_lossy().to_string();
    let dir = tmp_dir("trim");
    let video = dir.join("in.mp4");
    let out = dir.join("clip_1.mp4");
    make_test_video(&ffmpeg, &video, 6, "640x360");

    let (events, mut rx) = RenderEvents::channel();
    let ev2 = events.clone();
    let ff = ffmpeg.clone();
    let fp = ffprobe.clone();
    let v = video.to_string_lossy().to_string();
    let o = out.to_string_lossy().to_string();
    let o2 = o.clone();
    let task = tokio::spawn(async move {
        kull_engine::render::trim_video(&ff, &fp, &v, &o2, 1.0, 4.0, Lang::Vi, &Dictionary::new(), &ev2).await
    });
    drop(events);

    let mut count = 0usize;
    let mut done = false;
    let mut last_pct = 0.0f64;
    while let Some(ev) = rx.recv().await {
        match ev {
            RenderEvent::Progress(p) => {
                count += 1;
                last_pct = p.pct;
            }
            RenderEvent::Done(_) => done = true,
            RenderEvent::Log { level, message } => println!("  [{:?}] {}", level, message),
            RenderEvent::Error(e) => println!("  [ERROR] {}", e),
        }
    }
    let res = task.await.expect("join trim").expect("xuất clip thất bại");
    assert_eq!(res.output_path, o);
    assert!(out.exists(), "không có file clip: {:?}", out);

    let m = probe_media(&ffprobe, out.to_str().unwrap(), Lang::Vi, &Dictionary::new())
        .await
        .expect("probe clip thất bại");
    println!(
        "trim: {:.2}s, audio={}, {} event tiến độ, pct cuối {:.1}, done={}",
        m.duration, m.has_audio, count, last_pct, done
    );
    assert!(m.has_audio, "file cắt bị MẤT âm thanh");
    assert!((m.duration - 3.0).abs() < 0.5, "clip phải dài ~3s, nhận {:.2}s", m.duration);
    assert!(done, "không phát sự kiện Done cho UI");
    assert!(count >= 1, "không có sự kiện tiến độ khi xuất clip");
}

#[test]
fn subtitle_info_parses_ass() {    let dir = tmp_dir("subinfo");
    let sub = dir.join("in.ass");
    std::fs::write(&sub, ASS).unwrap();
    let info = kull_engine::subtitle::subtitle_info(sub.to_str().unwrap()).expect("subtitle_info lỗi");
    println!(
        "sub: {} · {} · {} dòng · {} thoại · style {:?} · font {:?} · {:.2}s..{:.2}s",
        info.format, info.encoding, info.lines, info.dialogues, info.styles, info.fonts, info.first_sec, info.last_sec
    );
    assert_eq!(info.format, "ASS");
    assert_eq!(info.dialogues, 1);
    assert_eq!(info.styles, vec!["Default".to_string()]);
    assert_eq!(info.fonts, vec!["Arial".to_string()]);
    assert!((info.first_sec - 0.2).abs() < 0.01);
    assert!((info.last_sec - 2.8).abs() < 0.01);
    assert!(info.size_bytes > 0);
}


