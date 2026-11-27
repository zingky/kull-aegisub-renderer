//! Tiện ích Windows: ẩn cửa sổ console của tiến trình con.
//!
//! Khi app chạy ở subsystem GUI (`windows_subsystem = "windows"`), mỗi lần spawn
//! ffmpeg/ffprobe/taskkill (đều là console app) Windows sẽ tạo một cửa sổ CMD đen
//! nếu không truyền `CREATE_NO_WINDOW`. Module này gom cờ đó về một chỗ.

/// Không cấp console cho tiến trình con (giá trị Win32 `CREATE_NO_WINDOW`).
#[cfg(windows)]
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Ẩn cửa sổ console cho `tokio::process::Command`.
pub fn hide_console(cmd: &mut tokio::process::Command) {
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    {
        let _ = cmd;
    }
}

/// Ẩn cửa sổ console cho `std::process::Command`.
#[allow(dead_code)]
pub fn hide_console_std(cmd: &mut std::process::Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    {
        let _ = cmd;
    }
}
