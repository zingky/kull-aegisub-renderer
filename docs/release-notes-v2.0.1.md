# Kull Aegisub Renderer v2.0.1

Bản sửa lỗi cho 2.0.0 — **hiệu ứng Aegisub (VSFilterMod) đã render đúng** và **ETA chính xác**.

## 🐛 Sửa lỗi quan trọng

### 1. Hiệu ứng VSFilterMod không được render (app lặng lẽ rơi về VSFilter.dll)

**Nguyên nhân:** bản `VSFilterMod.dll` kèm app (build `_VSMOD` — sorayuki/Masaiki) đăng ký hàm AviSynth tên **`TextSubMod`**, không phải `TextSub` như xy-VSFilter. Engine lại luôn sinh script `.avs` với `TextSub(...)` → AviSynth báo *“there is no function named TextSub”* → FFmpeg thoát lỗi → app tự chuyển sang `VSFilter.dll` rồi libass. Kết quả: chọn `VSFilterMod.dll` nhưng **mất các hiệu ứng đặc thù** (`\distort`, `\jitter`, `\1img…`, một số biến thể `\t`/karaoke).

**Đã sửa:**

- `createAvsScript()` tự chọn **đúng tên hàm theo bản build**: `VSFilterMod.dll → TextSubMod`, `VSFilter.dll → TextSub` (không còn gọi sai ⇒ không còn fallback âm thầm).
- Preflight vẫn dò theo thứ tự *đúng DLL + đúng hàm* → nếu vẫn lỗi mới thử hàm còn lại → cuối cùng mới đổi DLL. Log engine nay ghi rõ hàm đang dùng: `Engine phụ đề: VSFilterMod.dll qua AviSynth+ (TextSubMod)`.
- **Preview trong app cũng dùng đúng engine đã chọn** (trước đây preview luôn là libass): chọn `VSFilterMod.dll` thì khung xem trước render qua AviSynth + `TextSubMod` → thấy trước đúng hiệu ứng như bản render. Badge cạnh tiêu đề hiện `ASS live ✓ · TextSubMod`. Nếu AviSynth/plugin lỗi thì tự lùi về libass (không bao giờ mất khung hình).
- `\distort`, `\jitter`, `\1img/\2img/\3img/\4img`… nay thực sự có tác dụng.

### 2. ETA hiển thị sai (báo vài giây dù còn vài phút)

**Nguyên nhân:** ETA tính bằng `thời_gian_còn_lại / fps`. `fps` là *frame/giây video*, không phải *thời gian thực* → với `fps≈230` thì video còn 10 phút vẫn báo “1 giây”.

**Đã sửa:** tính theo `speed` của ffmpeg — `ETA = thời_gian_còn_lại / speed` (`speed=1.5x` nghĩa là 1 giây thực render được 1.5 giây video). Khi ffmpeg không in `speed`, dùng dự phòng `(tổng_frame − frame_hiện_tại) / fps`. ETA cũng hiện luôn trong dòng log tiến độ (`⚡ … · Còn lại: 3 phút 20 giây`).

## ✅ Kiểm chứng (đều có script chạy lại được)

| Test | Nội dung | Kết quả |
|---|---|---|
| `npm run test:vsfilter` | Engine `vsfiltermod` phải là `VSFilterMod.dll` + `TextSubMod`; render thật & kiểm tra **có chữ** trong frame (YAVG 4.52 vs baseline re-encode 0.21) | PASS |
| `npm run test:vsfm-effects` | Tag chỉ có ở VSFilterMod `\distort(...)`: VSFilterMod đổi frame rõ rệt (YAVG 5.49), libass bỏ qua hoàn toàn (YAVG 0), VSFilterMod ≠ libass (YAVG 2.76) | PASS |
| `npm run test:avs-seek` | Preview qua AviSynth: seek `-ss` ra **đúng frame** (không phải frame 0), cue tại 50s hiện khi seek 50s, cue 0.1–1.5s hiện ở 0.5s và chưa hiện ở 0s, ~2.5s/frame | PASS |
| `npm run test:trim` / `test:e2e` / `test:i18n` | Hồi quy: A→B + fade + Intro/Outro, render end-to-end, song ngữ VI/EN | PASS |

## 📥 Tải về (không cần cài đặt)

| Bản | Dung lượng | Mở app | Ghi chú |
|---|---|---|---|
| **ZIP - win-x64** ⭐ | ~194 MB | **~0.4 giây** | Nhanh nhất — giải nén 1 lần rồi chạy |
| **Portable .exe** | ~130 MB | 6-12 giây | 1 file duy nhất, tiện mang theo |

**Cách dùng bản ZIP (khuyến nghị)**

1. Tải `KullAegisubRenderer-2.0.1-win-x64.zip` → chuột phải → **Extract All…** ra thư mục bất kỳ (VD `D:\KullAegisubRenderer`).
2. Vào thư mục vừa giải nén → chạy **`Kull Aegisub Renderer.exe`**.
3. Lần đầu SmartScreen có thể cảnh báo (app chưa ký số) → **More info → Run anyway**.

> ⚠️ **Đừng chạy exe trực tiếp bên trong file ZIP** — Windows sẽ bung tạm ra `%TEMP%` mỗi lần mở (chậm như bản portable) và có thể lỗi thiếu file.
>
> ⚠️ Giữ nguyên toàn bộ file trong thư mục đã giải nén (các `.dll`, `locales/`, `resources/`) — thiếu 1 file là app không chạy.

## 🧰 Toolkit kèm sẵn

`ffmpeg` · `ffprobe` · `AviSynth.dll` (AviSynth+ 3.7.5 x64, chạy portable không cần cài) · `VSFilterMod.dll` · `VSFilter.dll` · `DirectShowSource.dll` — chọn engine `VSFilterMod.dll` / `VSFilter.dll` / `libass` ngay trong app.

## 🔧 Bản quyền & ghi công

FFmpeg (LGPL/GPL) · AviSynth+ (GPLv2) · VSFilterMod (GPL) · xy-VSFilter (GPL) · libass (ISC) · Electron · React · TailwindCSS.
