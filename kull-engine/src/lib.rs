 //! kull-engine — lõi render của Kull Aegisub Renderer, viết lại bằng Rust.
 //! Port từ `electron/ffmpegEngine.js` với kiểu dữ liệu mạnh (enum/struct/Result)
 //! thay vì JS object loosely-typed.
 //!
 //! Các năng lực chính:
 //!   - `probe_media`      : đọc thông số video/audio bằng ffprobe (JSON).
 //!   - `build_render_cmd` : lắp ráp lệnh FFmpeg type-safe (concat, scale/pad, hardsub, WebM, fade…).
 //!   - `start_render`     : spawn FFmpeg, parse tiến trình từ stderr, hủy/tự retry libass.
 //!   - `detect_encoders`  : probe encode thật (256×256) cho NVENC/QSV/AMF, cache 1 lần.
 //!   - `export_trim_clip` / `extract_thumbs` : cắt đoạn A→B và thumbnail timeline.
 //!   - `cleanup_stale_avs`: dọn file .avs tạm khi khởi động.

 pub use crate::error::EngineError;
 pub use crate::events::{Progress, RenderEvent, RenderOutcome, RenderEvents};
 pub use crate::i18n::{Dictionary, Lang, make_t};
 pub use crate::path::{escape_filter_path, resolve_bin_dir, Binaries};
 pub use crate::encoder::{quality_args, QualityArgs};
 pub use crate::render::{RenderEngine, export_trim_clip, extract_thumbs, cleanup_thumbs};
 pub use crate::subtitle::{SubtitleEngine, SubtitlePlan};
 pub use crate::types::{MediaMeta, RenderOptions, CustomQuality, QualityPreset};
 pub use crate::encoder::EncoderChoice;

pub mod command;
pub mod encoder;
pub mod error;
pub mod events;
pub mod i18n;
pub mod path;
pub mod progress;
pub mod render;
pub mod subtitle;
pub mod types;
pub mod probe;
pub mod win;