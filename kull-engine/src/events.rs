use crate::error::EngineError;
use crate::types::RenderResult;
use serde::Serialize;
use tokio::sync::mpsc;

/// Mức độ log.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum LogLevel {
    Info,
    Warn,
    Success,
    Error,
}

/// Tiến độ render (parse từ stderr của FFmpeg).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Progress {
    pub pct: f64,
    pub fps: Option<f64>,
    pub speed: Option<f64>,
    pub avg_speed: Option<f64>,
    pub eta: Option<f64>,
    pub frame: Option<u64>,
    pub bitrate_kbps: Option<f64>,
    pub size_kb: Option<u64>,
    pub time: String,
}

/// Kết quả render.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub enum RenderOutcome {
    Done(RenderResult),
    Canceled { output_path: String },
}

/// Sự kiện đẩy về UI.
#[derive(Debug, Clone, Serialize)]
pub enum RenderEvent {
    Log { level: LogLevel, message: String },
    Progress(Progress),
    Done(RenderResult),
    Error(EngineError),
}

/// Giao diện sự kiện render dùng channel mpsc (hỗ trợ gọi không chặn trong async,
/// tránh vấn đề borrow `FnMut` chia sẻ giữa các điểm await).
#[derive(Debug, Clone)]
pub struct RenderEvents {
    pub tx: mpsc::UnboundedSender<RenderEvent>,
}

impl RenderEvents {
    pub fn channel() -> (Self, mpsc::UnboundedReceiver<RenderEvent>) {
        let (tx, rx) = mpsc::unbounded_channel();
        (Self { tx }, rx)
    }
    pub fn send(&self, ev: RenderEvent) {
        let _ = self.tx.send(ev);
    }
}
