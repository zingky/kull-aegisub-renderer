use crate::types::{Hardware, QualityPreset};
use std::process::Stdio;
use tokio::process::Command;
use tokio::time::timeout;
use tokio::time::Duration;

const PROBE_SIZE: &str = "256x256";
const PROBE_TIMEOUT_MS: u64 = 8000;

/// Kết quả chọn encoder cho 1 lần render.
#[derive(Debug, Clone)]
pub struct EncoderChoice {
    pub encoder: String,
    pub hardware: Hardware,
    pub label: String,
    pub fallback: bool,
}

/// Mã video theo family (giữ nguyên family codec gốc).
fn encoder_map(codec_family: &str) -> &'static [(&'static str, &'static str, &'static str)] {
    let map: &[(&str, &str, &str)] = match codec_family {
        "hevc" => &[
            ("nvenc", "hevc_nvenc", "NVENC"),
            ("qsv", "hevc_qsv", "QSV"),
            ("amf", "hevc_amf", "AMD AMF"),
            ("cpu", "libx265", "CPU (x265)"),
        ],
        _ => &[
            ("nvenc", "h264_nvenc", "NVENC"),
            ("qsv", "h264_qsv", "Intel QSV"),
            ("amf", "h264_amf", "AMD AMF"),
            ("cpu", "libx264", "CPU (x264)"),
        ],
    };
    map
}

/// Thử encode thật 1 frame bằng encoder → true nếu mở được thiết bị + encode thành công.
/// Lý do không dùng `ffmpeg -encoders`: đó chỉ liệt kê encoder đã build, không kiểm tra GPU/driver.
pub async fn probe_encoder(ffmpeg_path: &str, encoder: &str) -> bool {
    let mut cmd = Command::new(ffmpeg_path);
    cmd.args([
        "-hide_banner", "-nostdin", "-loglevel", "error",
        "-f", "lavfi",
        "-i", &format!("color=c=black:s={}:r=1:d=1", PROBE_SIZE),
        "-frames:v", "1",
        "-c:v", encoder,
        "-f", "null", "-",
    ])
    .stdout(Stdio::null())
    .stderr(Stdio::piped());
    crate::win::hide_console(&mut cmd);
    let Ok(mut child) = cmd.spawn() else {
        return false;
    };
    let pid = child.id();
    let wait_task = tokio::spawn(async move { child.wait().await });
    match timeout(Duration::from_millis(PROBE_TIMEOUT_MS), wait_task).await {
        Ok(Ok(Ok(status))) => status.success(),
        _ => {
            if let Some(p) = pid {
                let mut kill = Command::new("taskkill");
                kill.args(["/pid", &p.to_string(), "/T", "/F"])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null());
                crate::win::hide_console(&mut kill);
                let _ = kill.status().await; // .await: nếu không, taskkill không hề chạy
            }
            false
        }
    }
}

/// Danh sách backend GPU thật sự dùng được + `cpu` luôn ở cuối. Gọi song song 3 probe.
pub async fn detect_encoders(ffmpeg_path: &str) -> Vec<Hardware> {
    let (nvenc, qsv, amf) = tokio::join!(
        probe_encoder(ffmpeg_path, "h264_nvenc"),
        probe_encoder(ffmpeg_path, "h264_qsv"),
        probe_encoder(ffmpeg_path, "h264_amf"),
    );
    let mut out = Vec::new();
    if nvenc { out.push(Hardware::Nvenc); }
    if qsv { out.push(Hardware::Qsv); }
    if amf { out.push(Hardware::Amf); }
    out.push(Hardware::Cpu);
    out
}

pub fn pick_encoder(
    hardware: Hardware,
    codec_family: &str,
    available: &[Hardware],
) -> EncoderChoice {
    let map = encoder_map(codec_family);
    let cpu_entry = map.iter().find(|(h, _, _)| *h == "cpu").unwrap();
    let fallback_label = "CPU (fallback: thiếu GPU encoder)";

    match hardware {
        Hardware::Auto => {
            for h in [Hardware::Nvenc, Hardware::Qsv, Hardware::Amf, Hardware::Cpu] {
                if available.contains(&h) {
                    let (_, enc, label) = map.iter().find(|(hh, _, _)| *hh == h.as_str()).unwrap();
                    return EncoderChoice {
                        encoder: enc.to_string(),
                        hardware: h,
                        label: label.to_string(),
                        fallback: h == Hardware::Cpu,
                    };
                }
            }
            // fallback cpu
            EncoderChoice {
                encoder: cpu_entry.1.to_string(),
                hardware: Hardware::Cpu,
                label: cpu_entry.2.to_string(),
                fallback: true,
            }
        }
        h => {
            let entry = map.iter().find(|(hh, _, _)| *hh == h.as_str());
            let (enc, label) = entry.map(|(_, e, l)| (*e, *l)).unwrap_or((cpu_entry.1, cpu_entry.2));
            if h != Hardware::Cpu && !available.contains(&h) {
                EncoderChoice {
                    encoder: cpu_entry.1.to_string(),
                    hardware: Hardware::Cpu,
                    label: fallback_label.to_string(),
                    fallback: true,
                }
            } else {
                EncoderChoice {
                    encoder: enc.to_string(),
                    hardware: h,
                    label: label.to_string(),
                    fallback: false,
                }
            }
        }
    }
}

/// Chuẩn hóa tên family codec từ ffprobe (h264/hevc).
pub fn codec_family(video_codec: &str) -> &'static str {
    let c = video_codec.to_lowercase();
    if c.contains("265") || c.contains("hevc") { "hevc" } else { "h264" }
}

/// Thiết lập chất lượng (Constrained VBR) từ preset + bitrate gốc (kbps).
#[derive(Debug, Clone, Copy)]
pub struct QualityArgs {
    pub bitrate: u32,
    pub maxrate: u32,
    pub bufsize: u32,
}

pub fn quality_args(quality: QualityPreset, avg_kbps: u32, custom_bitrate_kbps: Option<u32>) -> QualityArgs {
    let avg = avg_kbps.max(600);
    let (bv, maxr, buf) = match quality {
        QualityPreset::High => (avg * 3 / 4, avg, avg * 3 / 2),
        QualityPreset::Balanced => (avg * 55 / 100, avg * 7 / 10, avg * 11 / 10),
        QualityPreset::Small => (avg * 32 / 100, avg * 45 / 100, avg * 7 / 10),
        QualityPreset::Custom => {
            let bv = custom_bitrate_kbps.unwrap_or(avg);
            (bv, bv * 5 / 4, bv * 2)
        }
        QualityPreset::Original => (avg, avg * 5 / 4, avg * 2),
    };
    QualityArgs {
        bitrate: bv.max(100),
        maxrate: maxr.max(100),
        bufsize: buf.max(100),
    }
}
