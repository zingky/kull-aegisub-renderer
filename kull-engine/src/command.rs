use crate::encoder::{EncoderChoice, QualityArgs};
use crate::subtitle::{SubtitlePlan, SubtitlePlanType};
use crate::types::{MediaMeta, OutputFormat, QualityPreset, RenderOptions};

/// Lệnh FFmpeg đã lắp ráp (thay vì mảng chuỗi loosely-typed trong JS).
#[derive(Debug, Clone)]
pub struct RenderCommand {
    pub args: Vec<String>,
    pub main_meta: MediaMeta,
    pub sub_plan: SubtitlePlan,
    pub enc: EncoderChoice,
    pub qa: QualityArgs,
    pub duration_total: f64,
    pub fps: f64,
    pub has_intro: bool,
    pub has_outro: bool,
}

/// scale + pad + fps cho Intro/Outro khớp chuẩn video chính.
pub fn build_scale_pad_filter(w: u32, h: u32, fps: f64) -> String {
    format!(
        "scale={}:{}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2:black,fps={:.3},setsar=1",
        w, h, w, h, fps
    )
}

pub fn parse_resolution(s: &str) -> (u32, u32) {
    let lower = s.to_lowercase();
    let parts: Vec<&str> = lower.split('x').collect();
    let w: u32 = parts.first().and_then(|s| s.parse().ok()).unwrap_or(1280);
    let h: u32 = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(720);
    (w.max(1), h.max(1))
}

/// Chuỗi fade video: "fade=in...,fade=out...," (có dấu phẩy cuối để nối tiếp filter khác).
fn fade_chain(seg_dur: f64, is_first: bool, is_last: bool, d: f64) -> String {
    let mut parts = Vec::new();
    if is_first { parts.push(format!("fade=t=in:st=0:d={:.3}", d)); }
    if is_last && seg_dur > d { parts.push(format!("fade=t=out:st={:.3}:d={:.3}", (seg_dur - d).max(0.0), d)); }
    if parts.is_empty() { String::new() } else { parts.join(",") + "," }
}

/// Chuỗi fade audio (không có dấu phẩy cuối).
fn audio_fade_chain(seg_dur: f64, is_first: bool, is_last: bool, d: f64) -> String {
    let mut parts = Vec::new();
    if is_first { parts.push(format!("afade=t=in:st=0:d={:.3}", d)); }
    if is_last && seg_dur > d { parts.push(format!("afade=t=out:st={:.3}:d={:.3}", (seg_dur - d).max(0.0), d)); }
    parts.join(",")
}

/// Một đoạn video tham gia concat (intro / main / outro).
struct Segment<'a> {
    file: String,
    meta: Option<&'a MediaMeta>,
    is_main: bool,
    is_first: bool,
    is_last: bool,
}

pub fn build_render_command(
    options: &RenderOptions,
    main_meta: &MediaMeta,
    intro_meta: Option<&MediaMeta>,
    outro_meta: Option<&MediaMeta>,
    sub_plan: &SubtitlePlan,
    enc: &EncoderChoice,
    qa: &QualityArgs,
) -> RenderCommand {
    let mut args: Vec<String> = vec!["-hide_banner".into(), "-y".into()];

    let use_concat = options.merge_enabled && (options.intro.is_some() || options.outro.is_some());
    let has_intro = options.merge_enabled && options.intro.is_some();
    let has_outro = options.merge_enabled && options.outro.is_some();

    let sub_input = match &sub_plan.plan_type {
        SubtitlePlanType::Avs { avs_path, .. } => avs_path.to_string_lossy().to_string(),
        _ => options.main_video.clone(),
    };

    let fades = if options.fade.enabled { Some(options.fade.duration_sec()) } else { None };

    let (mut w, mut h) = (main_meta.width, main_meta.height);
    let mut fps = main_meta.fps;
    if options.quality == QualityPreset::Custom {
        if let Some(c) = &options.custom {
            let (cw, ch) = parse_resolution(&c.resolution);
            w = cw; h = ch;
            if let Ok(v) = c.fps.parse::<f64>() { if v > 0.0 { fps = v; } }
        }
    }
    if w == 0 || h == 0 { w = 1280; h = 720; }
    if fps == 0.0 { fps = 30.0; }
    fps = (fps * 1000.0).round() / 1000.0;

    let mut duration_total = main_meta.duration;

    if !use_concat {
        // ───────── Trường hợp chỉ render video chính ─────────
        args.push("-i".into()); args.push(sub_input.clone());

        let mut vf: Vec<String> = Vec::new();
        if let Some(d) = fades {
            let fc = fade_chain(main_meta.duration, true, true, d);
            if !fc.is_empty() { vf.push(fc.trim_end_matches(',').to_string()); }
        }
        if options.quality == QualityPreset::Custom {
            vf.push(format!("scale={}:{},fps={:.3},setsar=1", w, h, fps));
        }
        if let SubtitlePlanType::Libass { filter } = &sub_plan.plan_type {
            vf.push(filter.clone());
        }
        // Đồng nhất pixel format (nguồn 10-bit vẫn xuất được yuv420p 8-bit)
        vf.push("format=yuv420p".into());
        args.push("-vf".into()); args.push(vf.join(","));

        args.push("-map".into()); args.push("0:v:0".into());
        if main_meta.has_audio {
            args.push("-map".into()); args.push("0:a:0".into());
            if let Some(d) = fades {
                let af = audio_fade_chain(main_meta.duration, true, true, d);
                if !af.is_empty() { args.push("-af".into()); args.push(af); }
            }
        }
    } else {
        // ───────── Ghép Intro / Main / Outro bằng filter_complex + concat ─────────
        let mut segments: Vec<Segment> = Vec::new();
        if has_intro {
            if let Some(intro) = &options.intro {
                segments.push(Segment {
                    file: intro.clone(),
                    meta: intro_meta,
                    is_main: false,
                    is_first: true,
                    is_last: !has_outro,
                });
            }
        }
        segments.push(Segment {
            file: sub_input.clone(),
            meta: Some(main_meta),
            is_main: true,
            is_first: !has_intro,
            is_last: !has_outro,
        });
        if has_outro {
            if let Some(outro) = &options.outro {
                segments.push(Segment {
                    file: outro.clone(),
                    meta: outro_meta,
                    is_main: false,
                    is_first: false,
                    is_last: true,
                });
            }
        }

        let mut filter_parts: Vec<String> = Vec::new();
        let mut concat_refs: Vec<String> = Vec::new();
        let mut input_index = 0usize;
        duration_total = 0.0;

        for seg in &segments {
            let idx = input_index;
            args.push("-i".into()); args.push(seg.file.clone());
            input_index += 1;

            let seg_dur = seg
                .meta
                .map(|m| m.duration)
                .filter(|d| *d > 0.0)
                .unwrap_or(main_meta.duration);
            duration_total += seg_dur;

            // ── Video của đoạn ──
            let mut vf: Vec<String> = Vec::new();
            if let Some(d) = fades {
                let fc = fade_chain(seg_dur, seg.is_first, seg.is_last, d);
                if !fc.is_empty() { vf.push(fc.trim_end_matches(',').to_string()); }
            }
            if seg.is_main {
                if options.quality == QualityPreset::Custom {
                    vf.push(format!("scale={}:{},fps={:.3},setsar=1", w, h, fps));
                }
                // Phụ đề chỉ burn lên đoạn chính
                if let SubtitlePlanType::Libass { filter } = &sub_plan.plan_type {
                    vf.push(filter.clone());
                }
            } else {
                // Intro/Outro: scale + pad + fps theo chuẩn video chính
                vf.push(build_scale_pad_filter(w, h, fps));
            }
            vf.push("format=yuv420p".into());
            filter_parts.push(format!("[{}:v]{}[v{}]", idx, vf.join(","), idx));

            // ── Audio của đoạn ──
            let has_audio = seg.meta.map(|m| m.has_audio).unwrap_or(false);
            let audio_src = if has_audio {
                format!("[{}:a]", idx)
            } else {
                // Đoạn không có tiếng → chèn im lặng đúng độ dài để concat khớp
                let s_idx = input_index;
                args.push("-f".into()); args.push("lavfi".into());
                args.push("-t".into()); args.push(format!("{:.3}", seg_dur.max(0.1)));
                args.push("-i".into()); args.push("anullsrc=r=48000:cl=stereo".into());
                input_index += 1;
                format!("[{}:a]", s_idx)
            };
            let mut af: Vec<String> = vec![
                "aresample=48000".into(),
                "aformat=sample_fmts=fltp:channel_layouts=stereo".into(),
            ];
            if let Some(d) = fades {
                let afc = audio_fade_chain(seg_dur, seg.is_first, seg.is_last, d);
                if !afc.is_empty() { af.push(afc); }
            }
            filter_parts.push(format!("{}{}[a{}]", audio_src, af.join(","), idx));
            concat_refs.push(format!("[v{}][a{}]", idx, idx));
        }

        let n = concat_refs.len();
        filter_parts.push(format!(
            "{}concat=n={}:v=1:a=1[v][a]",
            concat_refs.join(""),
            n
        ));
        args.push("-filter_complex".into());
        args.push(filter_parts.join(";"));
        args.push("-map".into()); args.push("[v]".into());
        args.push("-map".into()); args.push("[a]".into());
    }

    // --- Video encoder (Constrained VBR / WebM) ---
    let is_webm = matches!(options.output_format, OutputFormat::Webm);
    if is_webm {
        args.push("-c:v".into()); args.push("libvpx-vp9".into());
        args.push("-b:v".into()); args.push(format!("{}k", qa.bitrate));
        args.push("-maxrate".into()); args.push(format!("{}k", qa.maxrate));
        args.push("-bufsize".into()); args.push(format!("{}k", qa.bufsize));
        args.push("-pix_fmt".into()); args.push("yuv420p".into());
        args.push("-row-mt".into()); args.push("1".into());
        args.push("-cpu-used".into()); args.push("2".into());
    } else {
        args.push("-c:v".into()); args.push(enc.encoder.clone());
        if enc.encoder == "libx264" || enc.encoder == "libx265" {
            let preset = match options.quality {
                QualityPreset::Original | QualityPreset::High => "slow",
                QualityPreset::Balanced => "medium",
                QualityPreset::Small => "fast",
                QualityPreset::Custom => "medium",
            };
            args.push("-preset".into()); args.push(preset.into());
        } else if enc.encoder.contains("nvenc") {
            args.extend(["-rc".into(), "vbr".into(), "-preset".into(), "p6".into(), "-tune".into(), "hq".into(), "-multipass".into(), "qres".into()]);
        } else if enc.encoder.contains("qsv") {
            args.extend(["-preset".into(), "medium".into()]);
        } else if enc.encoder.contains("amf") {
            args.extend(["-quality".into(), "quality".into()]);
        }
        args.push("-pix_fmt".into()); args.push("yuv420p".into());
        args.push("-b:v".into()); args.push(format!("{}k", qa.bitrate));
        args.push("-maxrate".into()); args.push(format!("{}k", qa.maxrate));
        args.push("-bufsize".into()); args.push(format!("{}k", qa.bufsize));
    }

    // --- Audio ---
    let output_path = options.output_path();
    let ext = output_path.rsplit('.').next().unwrap_or("mp4").to_lowercase();
    let ext_is_mp4 = matches!(ext.as_str(), "mp4" | "mov" | "m4v");
    // Codec audio tương thích container MP4 (copy được); còn lại phải encode lại AAC.
    let audio_mp4_ok = matches!(
        main_meta.audio_codec.to_lowercase().as_str(),
        "aac" | "mp3" | "ac3" | "eac3" | "alac"
    );
    if is_webm {
        if main_meta.has_audio || use_concat {
            args.push("-c:a".into()); args.push("libopus".into());
            args.push("-b:a".into()); args.push("128k".into());
        }
    } else if use_concat {
        // concat trả PCM từ filter → buộc encode lại AAC
        args.push("-c:a".into()); args.push("aac".into());
        args.push("-b:a".into()); args.push("192k".into());
        args.push("-ar".into()); args.push("48000".into());
    } else if main_meta.has_audio {
        if ext_is_mp4 && !audio_mp4_ok {
            // vd: Opus/DTS/FLAC/Vorbis trong .mkv → MP4 không chứa được, encode lại AAC
            args.push("-c:a".into()); args.push("aac".into());
            args.push("-b:a".into()); args.push("192k".into());
        } else if fades.is_some() {
            // fade audio cần re-encode (copy không áp được filter)
            args.push("-c:a".into()); args.push("aac".into());
            args.push("-b:a".into()); args.push("192k".into());
        } else {
            args.push("-c:a".into()); args.push("copy".into());
        }
    }

    // --- Container tối ưu ---
    if ext_is_mp4 {
        args.push("-movflags".into()); args.push("+faststart".into());
    }
    args.push(output_path);

    RenderCommand {
        args,
        main_meta: main_meta.clone(),
        sub_plan: sub_plan.clone(),
        enc: enc.clone(),
        qa: *qa,
        duration_total,
        fps,
        has_intro,
        has_outro,
    }
}
