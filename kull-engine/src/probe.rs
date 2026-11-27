use crate::error::EngineError;
use crate::i18n::{Dictionary, Lang};
use crate::types::MediaMeta;
use serde::Deserialize;
use std::process::Stdio;
use tokio::process::Command;

/// Output ffprobe (-print_format json -show_format -show_streams).
#[derive(Debug, Deserialize)]
struct FfprobeOutput {
    format: Option<FfprobeFormat>,
    streams: Option<Vec<FfprobeStream>>,
}

#[derive(Debug, Deserialize, Default)]
struct FfprobeFormat {
    duration: Option<String>,
    bit_rate: Option<String>,
    size: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FfprobeStream {
    codec_type: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    avg_frame_rate: Option<String>,
    duration: Option<String>,
    bit_rate: Option<String>,
    codec_name: Option<String>,
    sample_rate: Option<String>,
    channels: Option<u32>,
}

/// Đọc thông số file media bằng ffprobe (JSON).
pub async fn probe_media(
    ffprobe_path: &str,
    file_path: &str,
    lang: Lang,
    dict: &Dictionary,
) -> Result<MediaMeta, EngineError> {
    let t = |key: &str, vars: &[(&str, &str)]| dict.translate(lang, key, vars);

    let mut cmd = Command::new(ffprobe_path);
    cmd.kill_on_drop(true)
        .stdin(std::process::Stdio::null())  // -nostdin: không chờ nhập từ bàn phím
        .args([
            "-v", "error",
            "-hide_banner",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            // Giới hạn phân tích để file lớn / ổ chậm không bị treo lâu:
            "-probesize", "5000000",
            "-analyzeduration", "5000000",
            file_path,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    crate::win::hide_console(&mut cmd);
    let child = cmd
        .spawn()
        .map_err(|e| EngineError::Probe { msg: t("eng.err_probe_run", &[("msg", &e.to_string())]) })?;

    // Chặn treo vô hạn: ffprobe phải trả lời trong 45s.
    let out = tokio::time::timeout(
        std::time::Duration::from_secs(45),
        child.wait_with_output(),
    )
    .await
    .map_err(|_| EngineError::Probe {
        msg: format!("Đọc file quá lâu (>45s), đã dừng: {}", file_path),
    })?
    .map_err(|e| EngineError::Probe {
        msg: t("eng.err_probe_run", &[("msg", &e.to_string())]),
    })?;

    if !out.status.success() {
        let detail = String::from_utf8_lossy(&out.stderr).trim().to_string();
        let detail = if detail.is_empty() { file_path.to_string() } else { detail };
        return Err(EngineError::Probe {
            msg: t("eng.err_probe_code", &[("code", &out.status.code().map(|c| c.to_string()).unwrap_or_default()), ("detail", &detail)]),
        });
    }

    let info: FfprobeOutput = serde_json::from_slice(&out.stdout).map_err(|e| EngineError::Probe {
        msg: t("eng.err_probe_parse", &[("msg", &e.to_string())]),
    })?;

    let streams = info.streams.unwrap_or_default();
    let video = streams.iter().find(|s| s.codec_type.as_deref() == Some("video"));
    let audio = streams.iter().find(|s| s.codec_type.as_deref() == Some("audio"));
    let fmt = info.format.unwrap_or_default();

    let fps = parse_avg_frame_rate(video.and_then(|v| v.avg_frame_rate.as_deref()));
    let duration = parse_duration(fmt.duration.as_deref().or(video.and_then(|v| v.duration.as_deref())));
    let bitrate = parse_bitrate(fmt.bit_rate.as_deref().or(video.and_then(|v| v.bit_rate.as_deref())));
    let size_bytes = parse_size(fmt.size.as_deref());

    Ok(MediaMeta {
        path: file_path.to_string(),
        width: video.and_then(|v| v.width).unwrap_or(0),
        height: video.and_then(|v| v.height).unwrap_or(0),
        fps,
        duration,
        bitrate_avg_kbps: bitrate,
        video_codec: video.and_then(|v| v.codec_name.clone()).unwrap_or_default(),
        audio_codec: audio.and_then(|v| v.codec_name.clone()).unwrap_or_default(),
        has_audio: audio.is_some(),
        sample_rate: audio.and_then(|v| v.sample_rate.as_deref().and_then(|s| s.parse().ok())).unwrap_or(48000),
        channels: audio.and_then(|v| v.channels).unwrap_or(2),
        size_bytes,
    })
}

fn parse_avg_frame_rate(s: Option<&str>) -> f64 {
    let s = s.unwrap_or("0/1");
    let parts: Vec<&str> = s.split('/').collect();
    if parts.len() == 2 {
        let num: f64 = parts[0].parse().unwrap_or(0.0);
        let den: f64 = parts[1].parse().unwrap_or(1.0);
        if den > 0.0 {
            let fps = num / den;
            if fps.is_finite() {
                return (fps * 1000.0).round() / 1000.0;
            }
        }
    }
    0.0
}

fn parse_duration(s: Option<&str>) -> f64 {
    s.and_then(|s| s.parse::<f64>().ok()).filter(|v| v.is_finite()).unwrap_or(0.0)
}

fn parse_bitrate(s: Option<&str>) -> u32 {
    s.and_then(|s| s.parse::<u32>().ok()).unwrap_or(0) / 1000
}

fn parse_size(s: Option<&str>) -> u64 {
    s.and_then(|s| s.parse::<u64>().ok()).unwrap_or(0)
}
