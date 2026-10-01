# Kull Aegisub Renderer v2.0.2

Bản sửa lỗi cho 2.0.1 — **hết méo tiếng khi xuất clip A→B**, **xuất WebM chạy được**, **nút tiến/lùi 1 frame chính xác**.

## 🐛 Sửa lỗi quan trọng

### 1. Clip A→B bị méo tiếng “rè” khi đăng lên Facebook

**Nguyên nhân:** clip xuất ra có đỉnh âm thanh **vượt 0 dBFS** (đo được True Peak **+1.4 dBFS**). Nghe trên VLC thấy bình thường vì VLC không nén, nhưng **Facebook chuẩn hoá về khoảng −14 LUFS rồi nén lại** → phần đỉnh bị cắt → tiếng “rè”.

**Đã sửa:** engine áp `alimiter` chặn đỉnh về **−1.5 dBFS** (`limit=0.8413`, `level=disabled` nên không kéo nhỏ âm lượng tổng thể) ngay khi xuất clip. Đo lại trên cùng tín hiệu: đỉnh **+1.4 → −0.6 dBFS** ✅. Áp dụng cho cả MP4/AAC và WebM/Opus.

### 2. Chọn WebM thì render lỗi (FFmpeg thoát `-22`, không tạo được file)

**Nguyên nhân:** container `.webm` chỉ nhận VP8/VP9/AV1 + Vorbis/Opus. Trước đây app chỉ đổi **đuôi file** mà vẫn ép **H.264 + AAC** → FFmpeg không ghi được header, thoát lỗi và **không tạo file nào**.

**Đã sửa:** chọn WebM thì đổi hẳn codec — **`libvpx-vp9` + `libopus`** — ở cả render chính lẫn export clip.

### 3. Đuôi file clip A→B không theo định dạng đã chọn

**Nguyên nhân:** app lấy đuôi từ **file gốc** (`srcExt`) → nguồn là `.mkv` thì chọn định dạng MP4 clip vẫn xuất ra `.mkv`.

**Đã sửa:** lấy theo **định dạng bạn chọn** ở Mục 4 (`outputFormat`), chỉ fallback về đuôi gốc khi không xác định được.

### 4. Nút tiến / lùi “1 frame” bị lệch

**Nguyên nhân:** trước đây cộng `1/fps` (số thực) vào thời gian phát (`currentTime`) → sai số tích luỹ, không nhảy đúng 1 khung.

**Đã sửa:** nhảy theo **chỉ số frame nguyên** (`frameStep(±1)`) rồi quy đổi lại thời gian, và hiển thị luôn **số frame** cạnh đồng hồ (1 frame ở 23.976fps ≈ 0.042s, mắt thường không phân biệt được với 0.1s).

### 5. Dò encoder GPU báo “có” nhưng render chết giữa chừng

**Nguyên nhân:** `detectEncoders()` chỉ kiểm tra ffmpeg **có liệt kê** encoder hay không. Máy thiếu `amfrt64.dll` vẫn bị báo là “có AMF” → bắt đầu render rồi lỗi.

**Đã sửa:** app **encode thử thật một đoạn 256×256 vài frame** rồi mới coi là khả dụng (kích thước nhỏ hơn 256×256 cho kết quả sai nên phải dùng đúng mốc này).

### 6. Tiến trình / ETA / thời gian render

- **Dung lượng file xuất**: FFmpeg 9 dùng tiền tố IEC (`KiB`/`MiB`) chứ không phải `kB`/`MB` → regex cũ luôn trả `null`; nay parse đúng.
- **ETA** ổn định hơn; log ghi **thời gian render thực** thay vì con số ước lượng sai.
- **Tự dừng xem trước khi render**: đang phát preview mà bấm BẮT ĐẦU RENDER thì preview tự dừng → không tranh CPU với FFmpeg.

## ✅ Kiểm chứng (đều có script chạy lại được)

| Test | Nội dung | Kết quả |
|---|---|---|
| `npm run test:clip-audio` | Tạo nguồn vượt 0 dBFS rồi áp đúng chuỗi `alimiter` của engine → đỉnh phải hạ xuống ≤ 0 dBFS (đo bằng `volumedetect` + `ebur128` True Peak) | PASS |
| `npm run test:format` | Đuôi clip A→B theo định dạng đã chọn + nhánh WebM (encode thật: H.264/AAC vào `.webm` **fail** như cũ, VP9/Opus **thành công**) | PASS |
| `npm run test:frame-step` | `frameStep(±1)` nhảy đúng 1 frame trên chỉ số nguyên sau khi browser snap; chặn vượt biên | PASS |
| `npm run test:enc-probe` | `detectEncoders()` chỉ nhận encoder **encode thử được** (256×256) | PASS |
| `npm run test:asar` | `app.asar` trong bản đóng gói chứa đúng bundle + bản vá mới nhất | PASS |
| `npm run test:trim` / `test:vsfilter` / `test:vsfm-effects` / `test:avs-seek` / `test:e2e` / `test:i18n` | Hồi quy: cắt A→B + fade, engine VSFilterMod, hiệu ứng, seek preview, end-to-end, song ngữ | PASS |

## 📥 Tải về (không cần cài đặt)

| Bản | Dung lượng | Mở app | Ghi chú |
|---|---|---|---|
| **ZIP - win-x64** ⭐ | ~192 MB | **~0.4 giây** | Nhanh nhất — giải nén 1 lần rồi chạy |
| **Portable .exe** | ~130 MB | 6-12 giây | 1 file duy nhất, tiện mang theo |

**Cách dùng bản ZIP (khuyến nghị)**

1. Tải `KullAegisubRenderer-2.0.2-win-x64.zip` → chuột phải → **Extract All…** ra thư mục bất kỳ (VD `D:\KullAegisubRenderer`).
2. Vào thư mục vừa giải nén → chạy **`Kull Aegisub Renderer.exe`**.
3. Lần đầu SmartScreen có thể cảnh báo (app chưa ký số) → **More info → Run anyway**.

> ⚠️ **Đừng chạy exe trực tiếp bên trong file ZIP** — Windows sẽ bung tạm ra `%TEMP%` mỗi lần mở (chậm như bản portable) và có thể lỗi thiếu file.
>
> ⚠️ Giữ nguyên toàn bộ file trong thư mục đã giải nén (các `.dll`, `locales/`, `resources/`) — thiếu 1 file là app không chạy.

## 🧰 Toolkit kèm sẵn

`ffmpeg` · `ffprobe` · `AviSynth.dll` (AviSynth+ 3.7.5 x64, chạy portable không cần cài) · `VSFilterMod.dll` · `VSFilter.dll` · `DirectShowSource.dll` — chọn engine `VSFilterMod.dll` / `VSFilter.dll` / `libass` ngay trong app.

## 🔧 Bản quyền & ghi công

FFmpeg (LGPL/GPL) · AviSynth+ (GPLv2) · VSFilterMod (GPL) · xy-VSFilter (GPL) · libass (ISC) · Electron · React · TailwindCSS.
