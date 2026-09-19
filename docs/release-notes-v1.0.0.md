# Kull Aegisub Renderer v1.0.0

App desktop **ghép cứng phụ đề ASS/SRT vào video (Hardsub)** — Electron + React + TailwindCSS, lõi render **FFmpeg + VSFilter (AviSynth+)**.

## 📥 Chọn bản để tải

| Bản | Dung lượng | Thời gian mở app | Ghi chú |
|---|---|---|---|
| **`KullAegisubRenderer-1.0.0-win-x64.zip`** ⭐ | ~191 MB | **~0.4 giây** | Nhanh nhất — giải nén 1 lần rồi chạy |
| **`KullAegisubRenderer-1.0.0-portable.exe`** | ~129 MB | 6-12 giây | 1 file duy nhất, tiện mang theo |

### Cách dùng bản ZIP (khuyến nghị)

1. Chuột phải file zip → **Extract All…** ra thư mục bất kỳ (VD `D:\KullAegisubRenderer`).
2. Vào thư mục vừa giải nén → chạy **`Kull Aegisub Renderer.exe`**.
3. Lần đầu SmartScreen có thể cảnh báo (app chưa ký số) → **More info → Run anyway**.

> ⚠️ Đừng chạy exe trực tiếp bên trong file ZIP — Windows sẽ bung tạm ra `%TEMP%` mỗi lần mở (chậm như bản portable) và có thể lỗi đường dẫn.
>
> ⚠️ Giữ nguyên toàn bộ file trong thư mục đã giải nén (các `.dll`, `locales/`, `resources/`).

### Cách dùng bản Portable

Double-click file exe là xong — không cài đặt, không đụng registry, xóa file là gỡ sạch. Đổi lại mỗi lần mở phải chờ 6-12 giây để nó tự bung vào `%TEMP%`.

## ✨ Điểm chính

- 4 ô kéo thả: Video chính · Subtitle `.ass/.srt` · Intro · Outro (ghép đầu/cuối tùy chọn, tự scale + pad theo video gốc)
- 3 engine phụ đề: **VSFilterMod.dll** (mặc định) · **VSFilter.dll** · **libass** — tự chuyển libass nếu thiếu AviSynth/plugin
- Phần cứng: **Tự động (ưu tiên GPU)** · NVIDIA NVENC · Intel QSV · AMD AMF · CPU (x264/x265)
- Chất lượng: **Giữ nguyên gốc** (auto phân tích bitrate/res/fps → Constrained VBR) · Cao · Cân bằng · Tiết kiệm · Tùy chỉnh
- Định dạng xuất: MP4 (mặc định) · MKV · MOV · WebM · AVI
- Progress % · FPS · tốc độ × · ETA dạng "X giờ X phút X giây" · log chi tiết mỗi 5% · nút copy toàn bộ log
- Song ngữ **VI / EN** (đổi ngay trong app, ghi nhớ lựa chọn)
- Toolkit kèm sẵn: `ffmpeg`, `ffprobe`, `AviSynth.dll`, `VSFilterMod.dll`, `VSFilter.dll`, `DirectShowSource.dll`

## 🖥️ Yêu cầu

Windows 10/11 64-bit. Không cần cài FFmpeg, AviSynth hay VSFilter — đã đóng gói sẵn.