use serde::Serialize;
use std::fmt;

/// Lỗi của engine (thay vì throw Error chuỗi trong JS).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub enum EngineError {
    Start { msg: String },
    Run { msg: String },
    Exit { code: Option<i32>, detail: String },
    Generic { msg: String },
    Probe { msg: String },
    Io { msg: String },
    Canceled,
}

impl std::error::Error for EngineError {}

impl fmt::Display for EngineError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            EngineError::Start { msg } => write!(f, "Không khởi động được FFmpeg: {}", msg),
            EngineError::Run { msg } => write!(f, "Không chạy được FFmpeg: {}", msg),
            EngineError::Exit { code, detail } => {
                write!(f, "FFmpeg thoát với mã {:?}. {}", code, detail)
            }
            EngineError::Generic { msg } => write!(f, "Không thể render: {}", msg),
            EngineError::Probe { msg } => write!(f, "Lỗi ffprobe: {}", msg),
            EngineError::Io { msg } => write!(f, "Lỗi I/O: {}", msg),
            EngineError::Canceled => write!(f, "Đã hủy bởi người dùng."),
        }
    }
}
