# 🛠 Hướng dẫn hoàn thiện bản port Rust (Kull Aegisub Renderer)

Tôi đã port toàn bộ **lõi render (ffmpegEngine.js)** và **backend main process** sang Rust, đặt trong:

- `kull-engine/` — crate lõi (probe, build lệnh FFmpeg, kế hoạch phụ đề AVS/libass, parse tiến độ, probe encoder GPU thật, cắt clip, thumbnail, dọn .avs).
- `kull-app/src-tauri/` — backend Tauri thay thế Electron main process (lệnh IPC: probe, chọn file/thư mục, render, hủy, kiểm tra bin, encoder…).
- `rust-toolchain.toml`, `Cargo.toml` (workspace).

## 1. Cài toolchain Rust (chưa có trong môi trường này)

```powershell
# Tải rustup-init.exe rồi cài stable:
.\$env:TEMP\rustup-init.exe -y --default-toolchain stable --profile minimal
$env:PATH += ";$env:USERPROFILE\.cargo\bin"
rustc --version   # mong đợi: rustc 1.xx.x
```

Lưu ý: Khởi động lại terminal/PowerShell để PATH (%USERPROFILE%\.cargo\bin) có hiệu lực.

## 2. Linker (bắt buộc trên Windows MSVC target)

`cargo check`/`cargo build` cần linker + thư viện nhập Windows SDK (`kernel32.lib`, `userenv.lib`…). Môi trường này **chưa có Visual C++ Build Tools**, nên linker `link.exe` bị thiếu.

### Cách A (khuyên dùng): cài Build Tools
Tải "Build Tools for Visual Studio 2022" (chọn workload **C++ build tools** + Windows SDK), sau đó:

```powershell
cargo check -p kull-engine
cargo build -p kull-engine --release
```

### Cách B: dùng rust-lld (đã có trong toolchain) nếu có Windows SDK .lib
Nếu đã có SDK .lib nhưng thiếu `link.exe`:

```powershell
$env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER = "$env:USERPROFILE\.rustup\toolchains\stable-x86_64-pc-windows-msvc\lib\rustlib\x86_64-pc-windows-msvc\bin\rust-lld.exe"
cargo check -p kull-engine
```

(rust-lld đã được gọi đúng flavor `link` trong thử nghiệm; lỗi còn lại là thiếu `.lib` của Windows SDK, không phải lỗi mã Rust.)

## 3. Chạy kiểm thử

```powershell
cargo test -p kull-engine   # có unit test parse_progress_line
```

## 4. Kết nối giao diện (Tauri)

`kull-app/src-tauri/src/main.rs` đã định nghĩa các Tauri command mirrors IPC Electron cũ:
`init`, `check_bin`, `probe_media`, `detect_encoders`, `select_file`, `select_dir`, `open_folder`, `start_render`, `cancel_render`, `get_app_version`.

Sự kiện render đẩy về frontend qua sự kiện Tauri `"render:event"` (payload `RenderEvent` đã serialize). Côté React hiện tại (`src/`) dùng `window.renderAPI` (Electron IPC) — cần đổi thành gọi Tauri `invoke` + lắng nghe `"render:event"` (hoặc giữ Electron nếu chỉ muốn port lõi render sang Rust).

### Nếu muốn UI 100% Rust (không còn webview)
Thay `kull-app` bằng một GUI framework Rust pur (egui / iced / slint / druid) và gọi các hàm pública của `kull-engine`. Đây là bước rewrite UI lớn hơn, không nằm trong bản port lõi này.

## 5. Cấu trúc bin/ không đổi
Giữ nguyên `bin/` (ffmpeg.exe, ffprobe.exe, AviSynth.dll, VSFilter*.dll, avsplugins/). `kull-engine::path::resolve_bin_dir` ưu tiên `<resources>/bin`, fallback `<project>/bin` — tương thích bản portable Electron trước đó.

## 6. Điểm cải tiến kiểu dữ liệu (so với JS)
- `MediaMeta`, `RenderOptions`, `RenderResult`, `Progress`, `EncoderChoice`, `QualityArgs` là struct có tên, không phải object loosely-typed.
- `Lang`, `SubtitleEngine`, `Hardware`, `QualityPreset`, `OutputFormat`, `LogLevel` là enum exhaustively kiểm tra tại biên dịch.
- Lỗi dùng `EngineError` (enum) thay vì throw chuỗi; `Result<T, EngineError>` bắt buộc xử lý.
- Tất cả công khai có derive `Serialize/Deserialize` để truyền qua Tauri IPC an toàn.

## 7. Lệnh build app (sau khi có linker)
```powershell
cargo build -p kull-engine --release
# kull-app (Tauri) cần tauri CLI + frontend dist/:
# cd kull-app && cargo tauri build
```
