## Kull Aegisub Renderer 2.1.0 — bản 1 file exe

Chỉ cần tải **một file `.exe`**. Không cài đặt, không giải nén thủ công, không cần thư mục `bin/` đi kèm.

**[⬇️ Tải KullAegisubRenderer-2.1.0.exe](https://github.com/zingky/kull-aegisub-renderer/releases/download/v2.1.0/KullAegisubRenderer-2.1.0.exe)** (~98 MB)

### Cách dùng

1. Double-click file vừa tải. Lần đầu SmartScreen có thể cảnh báo (app chưa ký số) → **More info → Run anyway**.
2. **Lần đầu mở**, app tự giải nén `ffmpeg`, `ffprobe`, `AviSynth`, `VSFilter`, `VSFilterMod` vào `%LOCALAPPDATA%\Kull Aegisub Renderer` (~208 MB, mất vài giây). Các lần sau mở gần như tức thì.
3. File `.exe` có thể để ở bất kỳ đâu (Desktop, USB, Downloads…). Dữ liệu đã giải nén dùng chung, không cần chép kèm.

> Cần **Windows 10/11 64-bit** và **WebView2** (Windows 11 có sẵn; Windows 10 thường có sẵn theo Microsoft Edge).

### Có gì mới

- **Đúng 1 file exe**: ffmpeg, ffprobe, AviSynth, VSFilter, VSFilterMod, DirectShowSource và WebView2Loader được nhúng trong exe; lần đầu chạy tự giải nén.
- **Không còn cửa sổ CMD**: app chạy ở chế độ GUI, mọi tiến trình ffmpeg/ffprobe/taskkill đều được ẩn console.
- **Xuất clip A→B giữ nguyên âm thanh**, có % tiến độ và log chi tiết (`$ ffmpeg …`, `✅ Đã xuất clip…`) trong Console Log.
- **Ghép intro/outro ổn định** với video có/không có tiếng, giữ đúng tên file có dấu chấm (vd. `East Of Eden [Full Ver.]`).
- **Log & thông tin file chi tiết**: độ phân giải, fps, codec, bitrate, dung lượng; thông tin `.ass` (format/encoding/PlayRes/số dialogue/style/font/khoảng thời gian).
- **Tiến độ render** làm tròn 1 chữ số thập phân, hiện “Đang khởi động…” ngay từ đầu thay vì đứng ở 0%.

### Lưu ý

- Bản này thay thế hoàn toàn bản ZIP/portable cũ. Nếu từng dùng bản cũ, có thể xóa thư mục cũ.
- Muốn gỡ: xóa file exe và thư mục `%LOCALAPPDATA%\Kull Aegisub Renderer`.
