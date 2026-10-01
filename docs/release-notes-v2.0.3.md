# Kull Aegisub Renderer v2.0.3

Bản cập nhật nhỏ cho 2.0.2 — **mũi tên ←/→ tua theo bước bạn chọn** (1 frame / 1s / 5s), mặc định 1 giây.

## ✨ Tính năng mới

### Mũi tên ← / → tua theo “bước” đang chọn

Trước đây mũi tên ←/→ luôn cố định ±1 giây (giữ Shift là ±5 giây). Nay **bấm nút tua nào thì mũi tên tua theo đúng bước đó**:

| Bạn bấm nút | Mũi tên ← / → sẽ tua |
|---|---|
| *(chưa bấm gì)* | **1 giây** (mặc định) |
| Nút **1 frame** | **đúng 1 frame** |
| Nút **−1s** / **+1s** | **1 giây** |
| Nút **−5s** / **+5s** | **5 giây** |

- Nút đang được chọn **sáng viền xanh** để bạn biết mũi tên sẽ tua bao nhiêu.
- Thêm nhãn nhỏ ngay trên đồng hồ: `← → tua 1s` (đổi theo bước, có tooltip giải thích).
- **Shift + ←/→** vẫn giữ lối tắt **±5s** như trước.
- Chế độ 1 frame dùng đúng **chỉ số frame nguyên** nên bấm nhiều lần vẫn không trôi (1 frame ở 23.976fps ≈ 0.042s).

## ✅ Kiểm chứng (đều có script chạy lại được)

| Test | Nội dung | Kết quả |
|---|---|---|
| `npm run test:arrow-step` | Chạy **bundle thật** trong jsdom: chọn video rồi bấm nút + nhấn phím thật, đọc lại `video.currentTime` — kiểm tra từng bước (mặc định 1s / 5s / 1 frame / chặn biên / Shift ±5s / nhãn VI-EN) | PASS |
| `npm run test:frame-step` | (mở rộng) mô phỏng logic bước tua + kiểm tra source ghi nhớ bước | PASS |
| `npm run test:i18n` | Song ngữ: parity 138 khoá + nút VI/EN hoạt động | PASS |
| `npm run test:trim` | Render thật: cắt A→B, fade đầu/cuối, xuất clip A→B | PASS |
| `npm run test:format` · `test:clip-audio` · `test:repro` | Hồi quy: định dạng xuất, chặn méo tiếng, chọn file không crash | PASS |

## 🔧 Sửa lỗi kèm theo (đã có từ 2.0.2)

Xem [release v2.0.2](https://github.com/zingky/kull-aegisub-renderer/releases/tag/v2.0.2) — hết méo tiếng “rè” trên Facebook, xuất WebM chạy được, đuôi clip theo định dạng đã chọn, nút 1 frame chính xác.

## 📥 Tải về (không cần cài đặt)

| Bản | Dung lượng | Mở app | Ghi chú |
|---|---|---|---|
| **ZIP - win-x64** ⭐ | ~192 MB | **~0.4 giây** | Nhanh nhất — giải nén 1 lần rồi chạy |
| **Portable .exe** | ~130 MB | 6-12 giây | 1 file duy nhất, tiện mang theo |

**Cách dùng bản ZIP (khuyến nghị)**

1. Tải `KullAegisubRenderer-2.0.3-win-x64.zip` → chuột phải → **Extract All…** ra thư mục bất kỳ (VD `D:\KullAegisubRenderer`).
2. Vào thư mục vừa giải nén → chạy **`Kull Aegisub Renderer.exe`**.
3. Lần đầu SmartScreen có thể cảnh báo (app chưa ký số) → **More info → Run anyway**.

> ⚠️ **Đừng chạy exe trực tiếp bên trong file ZIP** — Windows sẽ bung tạm ra `%TEMP%` mỗi lần mở (chậm như bản portable) và có thể lỗi thiếu file.
>
> ⚠️ Giữ nguyên toàn bộ file trong thư mục đã giải nén (các `.dll`, `locales/`, `resources/`) — thiếu 1 file là app không chạy.

## 🧰 Toolkit kèm sẵn

`ffmpeg` · `ffprobe` · `AviSynth.dll` (AviSynth+ 3.7.5 x64, chạy portable không cần cài) · `VSFilterMod.dll` · `VSFilter.dll` · `DirectShowSource.dll` — chọn engine `VSFilterMod.dll` / `VSFilter.dll` / `libass` ngay trong app.

## 🔧 Bản quyền & ghi công

FFmpeg (LGPL/GPL) · AviSynth+ (GPLv2) · VSFilterMod (GPL) · xy-VSFilter (GPL) · libass (ISC) · Electron · React · TailwindCSS.
