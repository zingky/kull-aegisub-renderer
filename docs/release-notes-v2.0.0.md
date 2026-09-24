# Kull Aegisub Renderer v2.0.0

App desktop **ghép cứng phụ đề ASS/SRT vào video (Hardsub)** — Electron + React + TailwindCSS, lõi render **FFmpeg + VSFilter (AviSynth+)**.

## ✨ Có gì mới ở 2.0

| Tính năng | Chi tiết |
|---|---|
| 🎬 **Trình xem trước ngay trong app** | Chọn video là player hiện ra: play/pause, tiến-lùi **1 khung · 1 giây · 5 giây**, timeline có thumbnail, xem trước **phụ đề ASS/SRT ngay trên khung hình** (libass-wasm). Dùng để kiểm tra đã load đúng video/sub chưa trước khi render. |
| ✂️ **Cắt đoạn A → B** | Đặt mốc A/B bằng nút (lấy theo vị trí đang phát) → khi render chỉ xuất đúng đoạn đã chọn. |
| ⬇️ **Nút Export clip A→B** | Xuất riêng đoạn A→B **không kèm phụ đề**, **giữ nguyên định dạng gốc**, chất lượng bám theo file nguồn (Constrained VBR). |
| 🌓 **Fade đầu / cuối** | Bật/tắt fade, **tuỳ chỉnh thời gian** (mặc định 100 ms, cho phép 50–3000 ms). Tự áp đúng **đoạn đầu** và **đoạn cuối** của thành phẩm: có Intro/Outro thì fade theo đoạn đầu tiên và đoạn cuối cùng. |
| 🖥️ **Cửa sổ 1600×900** | Rộng hơn bản 1.0, toàn bộ tuỳ chọn gọn trong 1 màn hình, không phải cuộn. |
| ⚡ **Nhẹ hơn, mở nhanh hơn** | Bỏ ~107 MB file thừa trong toolkit + cắt gói ngôn ngữ Chromium (55 → 2), payload giảm 658 → 510 MB. |

## 🐛 Sửa lỗi quan trọng

- **Tick “Ghép Intro/Outro” không có tác dụng**: engine yêu cầu cờ `mergeEnabled` nhưng app không gửi, nên Intro/Outro bị bỏ qua và chỉ xuất đoạn video chính (lỗi có từ 1.0). Nay app gửi cờ rõ ràng và engine chỉ cần *có file* là ghép → đã có test hồi quy (`npm run test:trim`, case 6: intro 1s + A→B 2s + outro 1s = 4.00s).

## 📥 Tải về (không cần cài đặt)

| Bản | Dung lượng | Mở app | Ghi chú |
|---|---|---|---|
| **ZIP - win-x64** ⭐ | ~194 MB | **~0.4 giây** | Nhanh nhất — giải nén 1 lần rồi chạy |
| **Portable .exe** | ~131 MB | 6-12 giây | 1 file duy nhất, tiện mang theo |

**Cách dùng bản ZIP (khuyến nghị)**

1. Tải `KullAegisubRenderer-2.0.0-win-x64.zip` → chuột phải → **Extract All…** ra thư mục bất kỳ (VD `D:\KullAegisubRenderer`).
2. Vào thư mục vừa giải nén → chạy **`Kull Aegisub Renderer.exe`**.
3. Lần đầu SmartScreen có thể cảnh báo (app chưa ký số) → **More info → Run anyway**.

> ⚠️ **Đừng chạy exe trực tiếp bên trong file ZIP** — Windows sẽ bung tạm ra `%TEMP%` mỗi lần mở (chậm như bản portable) và có thể lỗi thiếu file.
>
> ⚠️ Giữ nguyên toàn bộ file trong thư mục đã giải nén (các `.dll`, `locales/`, `resources/`) — thiếu 1 file là app không chạy.

## 🧰 Toolkit kèm sẵn

`ffmpeg` · `ffprobe` · `AviSynth.dll` (AviSynth+ 3.7.5 x64, chạy portable không cần cài) · `VSFilterMod.dll` · `VSFilter.dll` · `DirectShowSource.dll` — chọn engine `VSFilterMod.dll` / `VSFilter.dll` / `libass` ngay trong app.

## 🖥️ Yêu cầu

- **Windows 10/11 64-bit**
- Tuỳ chọn: GPU NVIDIA/Intel/AMD để tăng tốc (app tự dò và bật NVENC/QSV/AMF nếu có)

## ✅ Kiểm thử trước khi phát hành

- Render thật bằng FFmpeg kèm sẵn: **11/11 PASS** (`npm run test:trim`) — trim đúng 2.00s, fade làm khung đầu tối hoàn toàn (luminance 0 vs 129), export clip A→B giữ `.mp4`, ghép Intro+A→B+Outro = 4.00s
- `npm run test:e2e` — render libass + ghép Intro/Outro: PASS
- `npm run test:repro` — chọn file không crash UI: PASS
- `npm run test:i18n` — song ngữ VI/EN parity 119 khoá: PASS
- `checkRows` / `checkQuality` / `checkBin` — layout & toolkit: PASS
