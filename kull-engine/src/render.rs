use crate::command::build_render_command;
use crate::encoder::{codec_family, detect_encoders, pick_encoder, quality_args};
use crate::error::EngineError;
use crate::events::{LogLevel, RenderEvent, RenderEvents, RenderOutcome};
use crate::i18n::make_t;
use crate::path::{escape_filter_path, Binaries};
use crate::probe::probe_media;
use crate::subtitle::{build_subtitle_plan, cleanup_avs, SubtitleEngine};
use crate::types::{Hardware, Lang, MediaMeta, QualityPreset, RenderOptions, RenderResult};
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::sync::Mutex;

/// Trạng thái render hiện tại (để hủy từ bên ngoài).
#[derive(Debug, Default)]
pub struct RenderState {
    pub cancel_requested: AtomicBool,
    pub current_child: Mutex<Option<tokio::process::Child>>,
}

/// Lõi render (port từ `ffmpegEngine.js`).
pub struct RenderEngine {
    pub ffmpeg: String,
    pub ffprobe: String,
    pub binaries: Binaries,
    pub dict: crate::i18n::Dictionary,
    pub state: Mutex<Option<Arc<RenderState>>>,
}

impl RenderEngine {
    pub fn new(binaries: Binaries, dict: crate::i18n::Dictionary) -> Self {
        let ffmpeg = binaries
            .ffmpeg_path()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "ffmpeg".into());
        let ffprobe = binaries
            .ffprobe_path()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "ffprobe".into());
        Self { ffmpeg, ffprobe, binaries, dict, state: Mutex::new(None) }
    }

    /// Hủy render đang chạy (gọi từ UI/Tauri).
    pub async fn cancel_render(&self) {
        let g = self.state.lock().await;
        if let Some(st) = g.as_ref() {
            st.cancel_requested.store(true, Ordering::SeqCst);
            if let Some(mut child) = st.current_child.lock().await.take() {
                let _ = child.kill().await;
            }
        }
    }

    /// Dọn file .avs tạm sót lại khi khởi động.
    pub fn cleanup_stale_avs(&self) -> u32 {
        let tmp_dir = std::env::temp_dir();
        let mut removed = 0u32;
        if let Ok(entries) = std::fs::read_dir(&tmp_dir) {
            for e in entries.flatten() {
                let p = e.path();
                if p.extension().map(|x| x == "avs").unwrap_or(false)
                    && p.file_name().and_then(|n| n.to_str()).map(|n| n.starts_with("kull_vietsub_")).unwrap_or(false)
                {
                    if std::fs::remove_file(&p).is_ok() { removed += 1; }
                }
            }
        }
        removed
    }

    /// Chạy render: thử theo lựa chọn người dùng; nếu AviSynth/VSFilter lỗi thì tự retry bằng libass.
    pub async fn start_render(&self, options: RenderOptions, events: RenderEvents) -> Result<RenderOutcome, EngineError> {
        let mut attempts: Vec<RenderOptions> = vec![options.clone()];
        if options.engine != SubtitleEngine::Libass {
            let mut fb = options.clone();
            fb.engine = SubtitleEngine::Libass;
            attempts.push(fb);
        }
        let mut last_error: Option<EngineError> = None;
        for opt in attempts {
            match self.run_render_attempt(opt, events.clone()).await {
                Ok(outcome) => return Ok(outcome),
                Err(e) => last_error = Some(e),
            }
        }
        Err(last_error.unwrap_or_else(|| EngineError::Generic { msg: "render failed".into() }))
    }

    /// Thực thi 1 lần render → Done | Canceled | Err.
    pub async fn run_render_attempt(&self, options: RenderOptions, events: RenderEvents) -> Result<RenderOutcome, EngineError> {
        let t = |key: &str, vars: &[(&str, &str)]| make_t(&self.dict, options.lang).call(key, vars);
        let emit = |ev: RenderEvent, evts: &RenderEvents| evts.send(ev);
        emit(RenderEvent::Log { level: LogLevel::Info, message: t("eng.start", &[]) }, &events);
        emit(RenderEvent::Log { level: LogLevel::Info, message: t("eng.probing", &[]) }, &events);

        let main_meta = probe_media(&self.ffprobe, &options.main_video, options.lang, &self.dict)
            .await
            .map_err(|e| EngineError::Probe { msg: e.to_string() })?;
        let mut duration_total = main_meta.duration;
        let mut intro_meta: Option<MediaMeta> = None;
        let mut outro_meta: Option<MediaMeta> = None;
        if options.merge_enabled {
            if let Some(intro) = &options.intro {
                if let Ok(m) = probe_media(&self.ffprobe, intro, options.lang, &self.dict).await {
                    duration_total += m.duration;
                    intro_meta = Some(m);
                }
            }
            if let Some(outro) = &options.outro {
                if let Ok(m) = probe_media(&self.ffprobe, outro, options.lang, &self.dict).await {
                    duration_total += m.duration;
                    outro_meta = Some(m);
                }
            }
        }

        let sub_plan = build_subtitle_plan(
            options.engine, options.subtitle.as_deref(), &options.main_video, main_meta.fps,
            &self.binaries, &self.dict, options.lang,
        ).await?;

        let mut fps = main_meta.fps;
        if options.quality == QualityPreset::Custom {
            if let Some(c) = &options.custom {
                if let Ok(v) = c.fps.parse::<f64>() { if v > 0.0 { fps = v; } }
            }
        }
        if fps == 0.0 { fps = 30.0; }
        fps = (fps * 1000.0).round() / 1000.0;

        let codec = codec_family(&main_meta.video_codec);
        let available = detect_encoders(&self.ffmpeg).await;
        let enc = pick_encoder(options.hardware, codec, &available);
        let custom_bps = options.custom.as_ref().and_then(|c| c.bitrate.parse::<u32>().ok()).unwrap_or(0);
        let qa = quality_args(options.quality, main_meta.bitrate_avg_kbps, Some(custom_bps));

        let cmd = build_render_command(&options, &main_meta, intro_meta.as_ref(), outro_meta.as_ref(), &sub_plan, &enc, &qa);

        emit(RenderEvent::Log { level: LogLevel::Info, message: format!("$ ffmpeg {}", cmd.args.join(" ")) }, &events);

        emit(RenderEvent::Log { level: LogLevel::Info, message: t("eng.main_meta", &[("w", &main_meta.width.to_string()), ("h", &main_meta.height.to_string()), ("fps", &main_meta.fps.to_string()), ("br", &main_meta.bitrate_avg_kbps.to_string())]) }, &events);
        if let Some(warn) = &sub_plan.warning { emit(RenderEvent::Log { level: LogLevel::Warn, message: warn.clone() }, &events); }
        if let Some(note) = &sub_plan.note { emit(RenderEvent::Log { level: LogLevel::Info, message: note.clone() }, &events); }
        match &sub_plan.plan_type {
            crate::subtitle::SubtitlePlanType::Avs { dll_name, fn_name, .. } => emit(RenderEvent::Log { level: LogLevel::Success, message: t("eng.avs_ok", &[("dll", dll_name), ("fn", fn_name)]) }, &events),
            _ => emit(RenderEvent::Log { level: LogLevel::Info, message: t("eng.libass_ok", &[]) }, &events),
        }
        let fallback = if enc.fallback { t("eng.fallback_tag", &[]) } else { String::new() };
        emit(RenderEvent::Log { level: LogLevel::Info, message: t("eng.encoder", &[("name", &enc.encoder), ("label", &enc.label), ("fallback", if enc.fallback { &fallback } else { "" })]) }, &events);
        emit(RenderEvent::Log { level: LogLevel::Info, message: t("eng.bitrate", &[("b", &qa.bitrate.to_string()), ("m", &qa.maxrate.to_string()), ("u", &qa.bufsize.to_string())]) }, &events);
        emit(RenderEvent::Log { level: LogLevel::Info, message: t("eng.output", &[("path", &options.output_path())]) }, &events);

        let total = duration_total;
        let out_fps = fps;
        let total_frames = if total > 0.0 && out_fps > 0.0 { (total * out_fps).round() as u64 } else { 0 };
        let sub_plan_temp = match &sub_plan.plan_type { crate::subtitle::SubtitlePlanType::Avs { avs_path, .. } => Some(avs_path.clone()), _ => None };

        let state = Arc::new(RenderState::default());
        { let mut g = self.state.lock().await; *g = Some(state.clone()); }
        state.cancel_requested.store(false, Ordering::SeqCst);
        let started_at = std::time::Instant::now();

        // Spawn FFmpeg
        let mut ff = tokio::process::Command::new(&self.ffmpeg);
        ff.args(&cmd.args)
            .stdin(std::process::Stdio::null())  // -nostdin: không chờ nhập từ bàn phím
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped());
        crate::win::hide_console(&mut ff);
        let child = match ff.spawn() {
            Ok(c) => c,
            Err(e) => {
                cleanup_avs(sub_plan_temp.as_ref());
                let _ = self.state.lock().await.take();
                return Err(EngineError::Start { msg: t("eng.err_start", &[("msg", &e.to_string())]) });
            }
        };
        {
            let mut g = state.current_child.lock().await;
            *g = Some(child);
        }

        let stderr = {
            let mut g = state.current_child.lock().await;
            g.as_mut().unwrap().stderr.take().unwrap()
        };
        let mut reader = BufReader::new(stderr);
        let mut last_lines: Vec<String> = Vec::new();
        let mut canceled = false;
        let mut progress_emitted = false;
        // FFmpeg in tiến độ bằng '\r' (CR), không phải '\n' → phải tự tách theo cả hai.
        // Đọc từng khối byte rồi cắt dòng để tiến độ hiện NGAY, không đợi tới cuối.
        let mut pending: Vec<u8> = Vec::new();
        let mut chunk = [0u8; 8192];

        loop {
            if state.cancel_requested.load(Ordering::SeqCst) {
                canceled = true;
                break;
            }
            let n = match reader.read(&mut chunk).await {
                Ok(0) => break,
                Ok(n) => n,
                Err(_) => break,
            };
            pending.extend_from_slice(&chunk[..n]);

            let mut start = 0usize;
            let mut i = 0usize;
            while i < pending.len() {
                let b = pending[i];
                if b == b'\r' || b == b'\n' {
                    if i > start {
                        let seg = String::from_utf8_lossy(&pending[start..i]).to_string();
                        handle_stderr_line(&seg, &events, total, total_frames, started_at.elapsed().as_secs_f64(), &mut last_lines, &mut progress_emitted);
                    }
                    start = i + 1;
                }
                i += 1;
            }
            if start > 0 {
                pending.drain(..start);
            }
            if pending.len() > 256 * 1024 {
                pending.clear();
            }
        }
        if !pending.is_empty() {
            let seg = String::from_utf8_lossy(&pending).to_string();
            handle_stderr_line(&seg, &events, total, total_frames, started_at.elapsed().as_secs_f64(), &mut last_lines, &mut progress_emitted);
        }

        // Đợi ffmpeg thoát (KHÔNG kill) và lấy exit status thật.
        let exit_code: i32 = {
            let mut g = state.current_child.lock().await;
            match g.take() {
                Some(mut c) => match tokio::time::timeout(std::time::Duration::from_secs(120), c.wait()).await {
                    Ok(Ok(s)) => s.code().unwrap_or(-1),
                    Ok(Err(_)) => -1,
                    Err(_) => {
                        let _ = c.kill().await;
                        -1
                    }
                },
                None => -1,
            }
        };
        let _ = self.state.lock().await.take();
        cleanup_avs(sub_plan_temp.as_ref());

        if canceled {
            emit(RenderEvent::Log { level: LogLevel::Warn, message: t("eng.canceled", &[]) }, &events);
            emit(RenderEvent::Done(RenderResult { output_path: options.output_path(), duration: total, elapsed_sec: 0.0, canceled: true }), &events);
            return Ok(RenderOutcome::Canceled { output_path: options.output_path() });
        }

        // ffmpeg thoát khác 0 → LUÔN báo lỗi (kể cả khi đã có tiến độ dở dang).
        if exit_code != 0 {
            let err_msg = if last_lines.is_empty() {
                format!("FFmpeg thoát với mã lỗi {} (không có thông báo)", exit_code)
            } else {
                summarize_stderr(&last_lines)
            };
            emit(RenderEvent::Log { level: LogLevel::Error, message: format!("FFmpeg lỗi: {}", err_msg) }, &events);
            return Err(EngineError::Generic { msg: err_msg });
        }

        // Kiểm tra file xuất thật sự tồn tại
        let out_path = options.output_path();
        let out_ok = std::fs::metadata(&out_path).map(|m| m.len() > 1024).unwrap_or(false);
        if !out_ok {
            let err_msg = format!("FFmpeg báo xong nhưng không thấy file xuất: {}", out_path);
            emit(RenderEvent::Log { level: LogLevel::Error, message: err_msg.clone() }, &events);
            return Err(EngineError::Generic { msg: err_msg });
        }

        let elapsed = started_at.elapsed().as_secs_f64();
        emit(RenderEvent::Log { level: LogLevel::Success, message: t("eng.done", &[("dur", &crate::types::format_duration(total)), ("took", &crate::types::format_elapsed(elapsed))]) }, &events);
        emit(RenderEvent::Done(RenderResult { output_path: options.output_path(), duration: total, elapsed_sec: elapsed, canceled: false }), &events);
        Ok(RenderOutcome::Done(RenderResult { output_path: options.output_path(), duration: total, elapsed_sec: elapsed, canceled: false }))
    }
}

/// Cắt đoạn A→B (không phụ đề, giữ định dạng gốc) — port từ `exportTrimClip`.
pub async fn export_trim_clip(
    ffmpeg: &str,
    main_video: &str,
    output_path: &str,
    start: f64,
    end: f64,
    lang: Lang,
    dict: &crate::i18n::Dictionary,
    events: &RenderEvents,
) -> Result<RenderOutcome, EngineError> {
    let t = |key: &str, vars: &[(&str, &str)]| make_t(dict, lang).call(key, vars);
    let dur = (end - start).max(0.1);
    let ext = std::path::Path::new(output_path).extension().and_then(|e| e.to_str()).unwrap_or("mp4");
    let is_webm = ext.eq_ignore_ascii_case("webm");
    let mut args = vec!["-y".into(), "-ss".into(), start.to_string(), "-t".into(), dur.to_string(), "-i".into(), main_video.into(), "-map".into(), "0:v:0".into()];
    if is_webm {
        args.extend(["-c:v".into(), "libvpx-vp9".into(), "-row-mt".into(), "1".into(), "-cpu-used".into(), "2".into()]);
    } else {
        args.extend(["-c:v".into(), "libx264".into(), "-preset".into(), "slow".into(), "-pix_fmt".into(), "yuv420p".into(), "-b:v".into(), "2500k".into()]);
    }
    args.push(output_path.into());
    let mut trim_cmd = tokio::process::Command::new(ffmpeg);
    trim_cmd.args(&args).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::piped());
    crate::win::hide_console(&mut trim_cmd);
    let mut child = trim_cmd.spawn()
        .map_err(|e| EngineError::Start { msg: t("eng.err_start", &[("msg", &e.to_string())]) })?;
    let stderr = child.stderr.take().unwrap();
    let mut reader = BufReader::new(stderr);
    let started_at = std::time::Instant::now();
    let mut line = String::new();
    loop {
        line.clear();
        match reader.read_line(&mut line).await {
            Ok(0) => break,
            Ok(_) => {
                let trimmed = line.trim();
                if trimmed.contains("frame=") && trimmed.contains("time=") {
                    if let Some(p) = crate::progress::parse_progress_line(&trimmed, dur, 0, started_at.elapsed().as_secs_f64()) {
                        events.send(RenderEvent::Progress(p));
                    }
                }
            }
            Err(_) => break,
        }
    }
    let _ = child.kill().await;
    let _ = child.wait().await;
    events.send(RenderEvent::Log { level: LogLevel::Success, message: t("eng.done", &[("dur", &crate::types::format_duration(dur)), ("took", &crate::types::format_elapsed(started_at.elapsed().as_secs_f64()))]) });
    Ok(RenderOutcome::Done(RenderResult { output_path: output_path.to_string(), duration: dur, elapsed_sec: started_at.elapsed().as_secs_f64(), canceled: false }))
}

/// Xuất riêng 1 đoạn video (A→B) — GIỮ CẢ HÌNH LẪN TIẾNG, không burn phụ đề.
/// Phát sự kiện log/tiến độ/done giống render để UI hiện đúng trạng thái.
pub async fn trim_video(
    ffmpeg: &str,
    ffprobe: &str,
    video_path: &str,
    output_path: &str,
    start: f64,
    end: f64,
    lang: Lang,
    dict: &crate::i18n::Dictionary,
    events: &RenderEvents,
) -> Result<RenderResult, EngineError> {
    let t = |key: &str, vars: &[(&str, &str)]| make_t(dict, lang).call(key, vars);
    let log = |level: LogLevel, message: String| events.send(RenderEvent::Log { level, message });

    log(LogLevel::Info, t("trim.start", &[]));
    log(LogLevel::Info, t("trim.probing", &[]));

    let meta = probe_media(ffprobe, video_path, lang, dict).await?;

    let src_dur = meta.duration.max(0.0);
    let start = if src_dur > 0.0 { start.max(0.0).min(src_dur) } else { start.max(0.0) };
    let mut dur = (end - start).max(0.1);
    if src_dur > 0.0 {
        dur = dur.min((src_dur - start).max(0.1));
    }
    if dur < 0.2 {
        return Err(EngineError::Generic { msg: t("trim.short", &[]) });
    }

    let fps = if meta.fps > 0.0 { meta.fps } else { 30.0 };
    let total_frames = (dur * fps).round() as u64;

    log(
        LogLevel::Info,
        t("trim.range", &[
            ("start", &crate::types::format_duration(start)),
            ("end", &crate::types::format_duration(start + dur)),
            ("dur", &crate::types::format_duration(dur)),
            ("w", &meta.width.to_string()),
            ("h", &meta.height.to_string()),
            ("fps", &format!("{:.3}", fps)),
        ]),
    );

    // Chọn encoder giống render (ưu tiên GPU), bitrate bám theo nguồn
    let codec = codec_family(&meta.video_codec);
    let available = detect_encoders(ffmpeg).await;
    let enc = pick_encoder(Hardware::Auto, codec, &available);
    let qa = quality_args(QualityPreset::Original, meta.bitrate_avg_kbps, None);

    let ext = std::path::Path::new(output_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp4")
        .to_lowercase();
    let is_webm = ext == "webm";
    let ext_is_mp4 = matches!(ext.as_str(), "mp4" | "mov" | "m4v");

    let mut args: Vec<String> = vec![
        "-hide_banner".into(), "-y".into(), "-nostdin".into(),
        // -ss TRƯỚC -i: seek nhanh; vì có re-encode nên điểm cắt vẫn chính xác
        "-ss".into(), format!("{:.3}", start),
        "-t".into(), format!("{:.3}", dur),
        "-i".into(), video_path.to_string(),
        "-map".into(), "0:v:0".into(),
    ];
    if meta.has_audio {
        args.push("-map".into());
        args.push("0:a:0".into());
    }

    if is_webm {
        args.extend([
            "-c:v".into(), "libvpx-vp9".into(),
            "-b:v".into(), format!("{}k", qa.bitrate),
            "-maxrate".into(), format!("{}k", qa.maxrate),
            "-bufsize".into(), format!("{}k", qa.bufsize),
            "-row-mt".into(), "1".into(),
            "-cpu-used".into(), "2".into(),
        ]);
    } else {
        args.push("-c:v".into());
        args.push(enc.encoder.clone());
        if enc.encoder == "libx264" || enc.encoder == "libx265" {
            args.extend(["-preset".into(), "veryfast".into()]);
        } else if enc.encoder.contains("nvenc") {
            args.extend(["-rc".into(), "vbr".into(), "-preset".into(), "p5".into(), "-tune".into(), "hq".into()]);
        } else if enc.encoder.contains("qsv") {
            args.extend(["-preset".into(), "medium".into()]);
        } else if enc.encoder.contains("amf") {
            args.extend(["-quality".into(), "quality".into()]);
        }
        args.extend([
            "-pix_fmt".into(), "yuv420p".into(),
            "-b:v".into(), format!("{}k", qa.bitrate),
            "-maxrate".into(), format!("{}k", qa.maxrate),
            "-bufsize".into(), format!("{}k", qa.bufsize),
        ]);
    }

    if meta.has_audio {
        // Re-encode audio: cắt chính xác, không lệch tiếng, chứa được trong mọi container
        args.extend([
            "-c:a".into(), "aac".into(),
            "-b:a".into(), "192k".into(),
            "-ar".into(), "48000".into(),
        ]);
    }
    if ext_is_mp4 {
        args.extend(["-movflags".into(), "+faststart".into()]);
    }
    args.push(output_path.to_string());

    log(LogLevel::Info, format!("$ ffmpeg {}", args.join(" ")));

    let mut trim_ff = tokio::process::Command::new(ffmpeg);
    trim_ff
        .args(&args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    crate::win::hide_console(&mut trim_ff);
    let mut child = trim_ff
        .spawn()
        .map_err(|e| EngineError::Start { msg: t("eng.err_start", &[("msg", &e.to_string())]) })?;

    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| EngineError::Run { msg: "không đọc được stderr của FFmpeg".into() })?;

    let started_at = std::time::Instant::now();
    let mut reader = BufReader::new(stderr);
    let mut pending: Vec<u8> = Vec::new();
    let mut chunk = [0u8; 8192];
    let mut last_lines: Vec<String> = Vec::new();
    let mut progress_emitted = false;

    // FFmpeg in tiến độ bằng '\r' → đọc khối byte và tách theo cả '\r' lẫn '\n'
    loop {
        let n = match reader.read(&mut chunk).await {
            Ok(0) => break,
            Ok(n) => n,
            Err(_) => break,
        };
        pending.extend_from_slice(&chunk[..n]);
        let mut from = 0usize;
        let mut i = 0usize;
        while i < pending.len() {
            let b = pending[i];
            if b == b'\r' || b == b'\n' {
                if i > from {
                    let seg = String::from_utf8_lossy(&pending[from..i]).to_string();
                    handle_stderr_line(
                        &seg, events, dur, total_frames,
                        started_at.elapsed().as_secs_f64(),
                        &mut last_lines, &mut progress_emitted,
                    );
                }
                from = i + 1;
            }
            i += 1;
        }
        if from > 0 {
            pending.drain(..from);
        }
        if pending.len() > 256 * 1024 {
            pending.clear();
        }
    }
    if !pending.is_empty() {
        let seg = String::from_utf8_lossy(&pending).to_string();
        handle_stderr_line(
            &seg, events, dur, total_frames,
            started_at.elapsed().as_secs_f64(),
            &mut last_lines, &mut progress_emitted,
        );
    }

    let exit_code = match child.wait().await {
        Ok(s) => s.code().unwrap_or(-1),
        Err(_) => -1,
    };
    let elapsed = started_at.elapsed().as_secs_f64();

    if exit_code != 0 {
        let msg = if last_lines.is_empty() {
            format!("FFmpeg thoát với mã lỗi {} (không có thông báo)", exit_code)
        } else {
            summarize_stderr(&last_lines)
        };
        log(LogLevel::Error, format!("FFmpeg lỗi: {}", msg));
        return Err(EngineError::Generic { msg });
    }

    let size = std::fs::metadata(output_path).map(|m| m.len()).unwrap_or(0);
    if size <= 1024 {
        let msg = format!("FFmpeg báo xong nhưng không thấy file clip: {}", output_path);
        log(LogLevel::Error, msg.clone());
        return Err(EngineError::Generic { msg });
    }

    log(
        LogLevel::Success,
        t("trim.done", &[
            ("path", output_path),
            ("dur", &crate::types::format_duration(dur)),
            ("size", &crate::types::format_bytes(size)),
            ("took", &crate::types::format_elapsed(elapsed)),
        ]),
    );
    let result = RenderResult {
        output_path: output_path.to_string(),
        duration: dur,
        elapsed_sec: elapsed,
        canceled: false,
    };
    events.send(RenderEvent::Done(result.clone()));
    Ok(result)
}

/// Trích xuất thumbnail timeline (1 frame/mốc) — chạy ffmpeg tuần tự và CHỜ xong.
pub async fn extract_thumbs(ffmpeg: &str, ffprobe: &str, video_path: &str, count: usize) -> Result<(Vec<(f64, PathBuf)>, PathBuf), EngineError> {
    let meta = probe_media(ffprobe, video_path, Lang::Vi, &crate::i18n::Dictionary::new()).await
        .map_err(|e| EngineError::Probe { msg: e.to_string() })?;
    let dir = std::env::temp_dir().join(format!("kull_thumbs_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos()));
    std::fs::create_dir_all(&dir).map_err(|e| EngineError::Io { msg: e.to_string() })?;
    let n = count.clamp(2, 40);
    let dur = if meta.duration > 0.0 { meta.duration } else { 1.0 };
    let mut thumbs = Vec::new();
    for i in 0..n {
        // Lấy mốc giữa mỗi đoạn để tránh frame đen ở đầu file
        let tt = (dur * (i as f64 + 0.5)) / n as f64;
        let file = dir.join(format!("th_{:03}.jpg", i));
        let args: Vec<String> = vec![
            "-hide_banner".into(), "-loglevel".into(), "error".into(), "-nostdin".into(),
            "-ss".into(), format!("{:.3}", tt),
            "-i".into(), video_path.into(),
            "-frames:v".into(), "1".into(),
            "-vf".into(), "scale=160:-2".into(),
            "-q:v".into(), "5".into(),
            "-y".into(), file.to_string_lossy().to_string(),
        ];
        let mut thumb_cmd = tokio::process::Command::new(ffmpeg);
        thumb_cmd
            .args(&args)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .kill_on_drop(true);
        crate::win::hide_console(&mut thumb_cmd);
        let ok = thumb_cmd
            .status()
            .await
            .map(|s| s.success())
            .unwrap_or(false);
        if ok {
            if let Ok(md) = std::fs::metadata(&file) {
                if md.len() > 0 {
                    thumbs.push((tt, file));
                }
            }
        }
    }
    Ok((thumbs, dir))
}

/// Render 1 frame PNG có phụ đề (libass) để hiện lên preview — nhanh, seek bằng -ss.
pub async fn render_preview_frame(
    ffmpeg: &str,
    video_path: &str,
    subtitle: Option<&str>,
    time_sec: f64,
) -> Result<PathBuf, EngineError> {
    let dir = std::env::temp_dir().join("kull_preview");
    std::fs::create_dir_all(&dir).map_err(|e| EngineError::Io { msg: e.to_string() })?;
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos();
    let out = dir.join(format!("frame_{}_{}.png", std::process::id(), stamp));

    let mut args: Vec<String> = vec![
        "-hide_banner".into(), "-loglevel".into(), "error".into(), "-nostdin".into(),
        "-ss".into(), format!("{:.3}", time_sec.max(0.0)),
        "-i".into(), video_path.into(),
        "-frames:v".into(), "1".into(),
    ];
    if let Some(sub) = subtitle.filter(|s| !s.is_empty()) {
        args.push("-vf".into());
        args.push(format!("subtitles='{}'", escape_filter_path(sub)));
    }
    args.push("-y".into());
    args.push(out.to_string_lossy().to_string());

    let mut cmd = tokio::process::Command::new(ffmpeg);
    cmd.args(&args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    crate::win::hide_console(&mut cmd);
    let child = cmd.spawn().map_err(|e| EngineError::Start { msg: e.to_string() })?;
    let res = tokio::time::timeout(std::time::Duration::from_secs(30), child.wait_with_output()).await;
    match res {
        Ok(Ok(out_res)) => {
            if !out_res.status.success() {
                let detail = String::from_utf8_lossy(&out_res.stderr).trim().to_string();
                return Err(EngineError::Generic { msg: if detail.is_empty() { "không tạo được khung hình".into() } else { detail } });
            }
        }
        Ok(Err(e)) => return Err(EngineError::Run { msg: e.to_string() }),
        Err(_) => return Err(EngineError::Generic { msg: "render khung hình quá lâu (>30s)".into() }),
    }
    if !out.exists() {
        return Err(EngineError::Generic { msg: "không tạo được khung hình".into() });
    }
    Ok(out)
}

/// Dọn thư mục tạm thumbnail — port từ `cleanupThumbs`.
pub fn cleanup_thumbs(dir: &PathBuf) {
    let _ = std::fs::remove_dir_all(dir);
}

/// Rút gọn stderr của FFmpeg thành vài dòng lỗi dễ đọc.
/// Trước đây UI nhận cả dump "Input #0 ... Metadata ... Stream ..." rất dài.
fn summarize_stderr(lines: &[String]) -> String {
    const KEYS: &[&str] = &[
        "error", "invalid", "failed", "no such", "cannot", "unable", "unrecognized",
        "does not exist", "conversion failed", "not found", "denied", "unknown encoder",
        "matches no streams", "does not contain any stream",
    ];
    let clean = |l: &String| -> String {
        // Mỗi dòng tối đa 400 ký tự để không làm ngập Console Log
        if l.chars().count() > 400 {
            l.chars().take(400).collect::<String>() + "…"
        } else {
            l.clone()
        }
    };
    let hits: Vec<String> = lines
        .iter()
        .filter(|l| {
            let low = l.to_lowercase();
            KEYS.iter().any(|k| low.contains(k))
        })
        .map(clean)
        .collect();
    let picked: Vec<String> = if !hits.is_empty() {
        hits[hits.len().saturating_sub(6)..].to_vec()
    } else {
        lines[lines.len().saturating_sub(8)..].iter().map(clean).collect()
    };
    picked.join("\n")
}

/// Xử lý 1 dòng stderr của FFmpeg: tiến độ → Progress, còn lại → log khi đáng chú ý.
fn handle_stderr_line(
    raw: &str,
    events: &RenderEvents,
    total: f64,
    total_frames: u64,
    elapsed: f64,
    last_lines: &mut Vec<String>,
    progress_emitted: &mut bool,
) {
    let line = raw.trim();
    if line.is_empty() {
        return;
    }
    if line.contains("frame=") && line.contains("time=") {
        *progress_emitted = true;
        if let Some(p) = crate::progress::parse_progress_line(line, total, total_frames, elapsed) {
            events.send(RenderEvent::Progress(p));
        }
        return;
    }
    last_lines.push(line.to_string());
    if last_lines.len() > 60 {
        last_lines.remove(0);
    }
    let low = line.to_lowercase();
    if low.contains("error")
        || low.contains("fail")
        || low.contains("invalid")
        || low.contains("denied")
        || low.contains("cannot")
        || low.contains("unable")
        || low.contains("not found")
        || low.contains("no such file")
    {
        events.send(RenderEvent::Log { level: LogLevel::Warn, message: line.to_string() });
    }
}



