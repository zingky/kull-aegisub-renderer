use crate::events::Progress;

const RE_TIME_PREFIX: &str = "time=";
const RE_FPS_PREFIX: &str = "fps=";
const RE_SPEED_PREFIX: &str = "speed=";
const RE_FRAME_PREFIX: &str = "frame=";
const RE_BITRATE_PREFIX: &str = "bitrate=";
const RE_SIZE_PREFIX: &str = "size=";

/// Parse 1 dòng stderr của FFmpeg kiểu:
///   frame= 123 fps=45.6 q=28.0 size=... time=00:01:23.45 bitrate=... speed=1.5x
/// Trả về None nếu dòng không có `time=` (bỏ qua dòng không phải tiến độ).
pub fn parse_progress_line(
    line: &str,
    total: f64,
    total_frames: u64,
    elapsed_sec: f64,
) -> Option<Progress> {
    if !line.contains("frame=") || !line.contains("time=") {
        return None;
    }
    let time_secs = parse_time_field(line)?;
    // Làm tròn 1 chữ số thập phân ngay tại nguồn: tránh UI/log hiện
    // "0.6682045584719407%". Chỉ làm tròn để hiển thị, không ảnh hưởng ETA.
    let pct = if total > 0.0 {
        let raw = ((time_secs / total) * 100.0).clamp(0.0, 100.0);
        (raw * 10.0).round() / 10.0
    } else {
        0.0
    };
    let fps = field_after(line, RE_FPS_PREFIX).and_then(|s| s.parse::<f64>().ok());
    let speed = field_after(line, RE_SPEED_PREFIX)
        .and_then(|s| s.trim_end_matches('x').parse::<f64>().ok());
    let frame = field_after(line, RE_FRAME_PREFIX).and_then(|s| s.parse::<u64>().ok());
    let bitrate = field_after(line, RE_BITRATE_PREFIX)
        .and_then(|s| parse_bitrate(s));
    let size_kb = field_after(line, RE_SIZE_PREFIX).and_then(|s| parse_size(s));

    let remaining = (total - time_secs).max(0.0);
    let avg_speed = if elapsed_sec > 2.0 && time_secs > 0.0 {
        Some(time_secs / elapsed_sec)
    } else {
        None
    };
    let eta = if let Some(avg) = avg_speed {
        if avg > 0.0 { Some(remaining / avg) } else { None }
    } else if let Some(sp) = speed {
        if sp > 0.0 { Some(remaining / sp) } else { None }
    } else if let (Some(fps), Some(frame)) = (fps, frame) {
        if fps > 0.0 && total_frames > 0 {
            Some(((total_frames as f64) - (frame as f64)) / fps)
        } else {
            None
        }
    } else {
        None
    };

    let time_str = format_time(time_secs);
    Some(Progress {
        pct,
        fps,
        speed,
        avg_speed,
        eta,
        frame,
        bitrate_kbps: bitrate,
        size_kb,
        time: time_str,
    })
}

fn parse_time_field(line: &str) -> Option<f64> {
    let start = line.find(RE_TIME_PREFIX)? + RE_TIME_PREFIX.len();
    let end = line[start..].find(|c: char| c.is_whitespace() || c == ',')?;
    let token = &line[start..start + end];
    let parts: Vec<&str> = token.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let h: f64 = parts[0].parse().ok()?;
    let m: f64 = parts[1].parse().ok()?;
    let s: f64 = parts[2].parse().ok()?;
    Some(h * 3600.0 + m * 60.0 + s)
}

/// Lấy giá trị ngay sau một prefix đến khi gặp khoảng trắng.
fn field_after<'a>(line: &'a str, prefix: &str) -> Option<&'a str> {
    let pos = line.find(prefix)?;
    let start = pos + prefix.len();
    let rest = &line[start..];
    // Bỏ qua khoảng trắng ngay sau prefix (FFmpeg in ra dạng "fps= 45.6")
    let rest = rest.trim_start();
    let end = rest.find(|c: char| c.is_whitespace()).unwrap_or(rest.len());
    let token = &rest[..end];
    if token.is_empty() {
        None
    } else {
        Some(token)
    }
}

fn parse_bitrate(s: &str) -> Option<f64> {
    // "1234kbits/s" hoặc "1.2Mbits/s"
    let s = s.replace("kbits/s", "").replace("Mbits/s", "");
    let v: f64 = s.trim().parse().ok()?;
    Some(if s.contains("M") { v * 1000.0 } else { v })
}

fn parse_size(s: &str) -> Option<u64> {
    // "439KiB", "12MiB", "1.4GiB", "439kB", "12MB"
    let s = s.to_lowercase();
    let mult = if s.ends_with("gib") || s.ends_with("gb") {
        1024 * 1024
    } else if s.ends_with("mib") || s.ends_with("mb") {
        1024
    } else if s.ends_with("kib") || s.ends_with("kb") || s.ends_with('k') {
        1
    } else {
        1
    };
    let digits: String = s.chars().filter(|c| c.is_ascii_digit() || *c == '.').collect();
    let v: f64 = digits.parse().ok()?;
    Some((v * mult as f64).round() as u64)
}

fn format_time(secs: f64) -> String {
    let secs = secs.max(0.0);
    let h = (secs / 3600.0) as u64;
    let m = ((secs % 3600.0) / 60.0) as u64;
    let s = (secs % 60.0) as u64;
    format!("{:02}:{:02}:{:02}", h, m, s)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_progress_line() {
        let line = "frame= 123 fps= 45.6 q=28.0 size=  439KiB time=00:01:23.45 bitrate= 1234.5kbits/s speed= 1.5x";
        let p = parse_progress_line(line, 360.0, 9000, 10.0).unwrap();
        assert!((p.pct - 23.2).abs() < 0.1);
        // Tiến độ luôn là số có tối đa 1 chữ số thập phân
        assert_eq!((p.pct * 10.0).round() / 10.0, p.pct);
        assert_eq!(p.fps, Some(45.6));
        assert_eq!(p.speed, Some(1.5));
        assert_eq!(p.frame, Some(123));
        assert_eq!(p.time, "00:01:23");
    }
    #[test]
    fn ignores_non_progress_line() {
        assert!(parse_progress_line("[AVS] something", 360.0, 0, 10.0).is_none());
    }
}
