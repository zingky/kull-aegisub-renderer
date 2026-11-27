# 🎬 Kull Aegisub Renderer

**Tiếng Việt** · [English](./README.en.md)

App desktop **ghép cứng phụ đề ASS/SRT vào video (Hardsub)** — **Tauri + Rust + React + TailwindCSS**, lõi render **FFmpeg + VSFilter (AviSynth+)**.


---

## 🖼️ Giao diện

<img width="2556" height="1512" alt="Kull Aegisub Renderer - UI" src="https://github.com/user-attachments/assets/b6461381-cecc-4ef3-af4a-22b3be0c4f76" />

---

## 📥 Tải về (1 file exe duy nhất)

[Bản mới nhất](https://github.com/zingky/kull-aegisub-renderer/releases/latest) — chỉ cần tải **một file `.exe`**, không cần cài đặt, không cần giải nén thủ công.

**[⬇️ Tải KullAegisubRenderer-2.1.0.exe](https://github.com/zingky/kull-aegisub-renderer/releases/download/v2.1.0/KullAegisubRenderer-2.1.0.exe)** (~98 MB)

1. Double-click file vừa tải. Lần đầu SmartScreen có thể cảnh báo (app chưa ký số) → **More info → Run anyway**.
2. **Lần đầu mở**, app tự giải nén ffmpeg/ffprobe/AviSynth/VSFilter vào `%LOCALAPPDATA%\Kull Aegisub Renderer` (khoảng 208 MB, mất vài giây). Các lần sau mở gần như tức thì.
3. File `.exe` có thể để ở bất kỳ đâu (Desktop, USB, thư mục Downloads…) — dữ liệu đã giải nén dùng chung, **không cần chép kèm thư mục `bin/`**.

> ✅ Không cần cài FFmpeg, AviSynth hay VSFilter. Không ghi registry. Muốn gỡ: xóa file exe và thư mục `%LOCALAPPDATA%\Kull Aegisub Renderer`.
>
> 💡 Cần **Windows 10/11 64-bit** và **WebView2** (Windows 11 có sẵn; Windows 10 thường có sẵn theo Microsoft Edge).

---

## ✨ Có gì mới ở 2.1.0

- **Chỉ còn đúng 1 file exe**: ffmpeg, ffprobe, AviSynth, VSFilter, VSFilterMod, DirectShowSource và WebView2Loader được nhúng thẳng vào exe; lần đầu chạy tự giải nén. Không còn thư mục `bin/` phải chép kèm.
- **Không còn cửa sổ CMD**: app chạy ở chế độ GUI, mọi tiến trình ffmpeg/ffprobe/taskkill đều được ẩn console.
- **Xuất clip A→B giữ nguyên âm thanh**, hiện % và ghi log chi tiết vào Console Log.
- **Ghép intro/outro ổn định** với video có/không có tiếng, giữ đúng tên file có dấu chấm (vd. `East Of Eden [Full Ver.]`).

## ✨ Có gì mới ở 2.0.3

- **Mũi tên ←/→ tua theo bước bạn chọn**: bấm nút **1 frame** / **±1s** / **±5s** thì ←/→ tua đúng bước đó; chưa bấm gì → mặc định **1 giây**. Nút đang chọn sáng viền xanh và có nhãn `← → tua 1s` trên đồng hồ. **Shift + ←/→** vẫn là lối tắt ±5s.

## 🐛 Sửa lỗi ở 2.0.2

- **Hết méo tiếng “rè” trên Facebook**: clip A→B trước đây có đỉnh vượt 0 dBFS (True Peak +1.4 dBFS) nên Facebook chuẩn hoá rồi nén lại làm méo. Nay engine chặn đỉnh về **−1.5 dBFS** ngay khi xuất clip (áp cho cả MP4 và WebM).
- **Xuất WebM không còn lỗi**: chọn `.webm` trước đây khiến FFmpeg thoát lỗi `-22` (không tạo được file) vì bị ép H.264/AAC — nay render chính và clip đều dùng đúng **VP9 + Opus**.
- **Đuôi file clip A→B theo định dạng đã chọn**: trước đây lấy đuôi từ **file gốc** nên chọn MP4 nhưng nguồn `.mkv` thì clip vẫn ra `.mkv`.
- **Nút tiến/lùi “1 frame” chính xác**: trước đây cộng nhầm `1/fps` (số thực) nên bị lệch; nay nhảy theo **chỉ số frame nguyên** và hiện luôn **số frame** cạnh đồng hồ.
- **Dò encoder GPU chính xác**: trước đây dò nhầm là “có AMF/QSV” (chỉ kiểm tra danh sách) dù máy thiếu `amfrt64.dll` → render chết giữa chừng. Nay app **encode thử thật khung 256×256** rồi mới báo hỗ trợ.
- **Dung lượng file xuất / ETA / thời gian render**: sửa parse dung lượng của FFmpeg 9 (dùng `KiB`/`MiB` chứ không phải `kB`/`MB`), ETA ổn định hơn, log báo **thời gian render thực**.
- **Tự dừng xem trước khi render**: đang phát preview mà bấm render thì preview tự dừng → không tranh CPU.

## 🐛 Sửa lỗi ở 2.0.1

- **Hiệu ứng VSFilterMod nay render thật**: `VSFilterMod.dll` đăng ký hàm AviSynth **`TextSubMod`** (không phải `TextSub`) → trước đây app gọi sai tên hàm nên lặng lẽ rơi về `VSFilter.dll`/libass và **mất hiệu ứng** (`\distort`, `\jitter`, `\1img…`). Nay engine chọn đúng hàm theo bản build, và **khung xem trước cũng render bằng đúng engine đã chọn** (badge hiện `ASS live ✓ · TextSubMod`).
- **ETA chính xác**: tính theo `speed` của ffmpeg thay vì `fps` (trước đây `fps≈230` nên còn 10 phút vẫn báo “1 giây”).

## 🆕 Có gì mới ở 2.0

| Tính năng | Chi tiết |
|---|---|
| 🎬 **Xem trước trong app** | Chọn video là player hiện ra: play/pause, tiến-lùi **1 khung · 1s · 5s**, timeline thumbnail, **xem trước phụ đề render ngay trên khung hình** bằng **đúng engine bạn chọn** (AviSynth + `TextSubMod`/`TextSub`, hoặc libass) (hỗ trợ .ass/.ssa/.srt, UTF-8 & UTF-16 từ Aegisub Windows) — **dừng phát hoặc kéo timeline** là frame phụ đề hiện ngay; không dùng WebGL/WASM nên **không bao giờ có màn hình đen**, lỗi cũng chỉ ẩn phụ đề thôi. **Nút CC** bật/tắt tức thì. **Nút mở VLC/MPV** (nếu máy có cài) xem trước lúc đang phát bằng libass native — chuẩn 100% như bản render |
| ✂️ **Cắt đoạn A → B** | Đặt mốc A/B bằng nút → render chỉ xuất đúng đoạn đã chọn |
| ⬇️ **Export clip A→B** | Xuất riêng đoạn A→B **không phụ đề**, **giữ nguyên định dạng gốc** |
| 🌓 **Fade đầu / cuối** | Bật/tắt + **tuỳ chỉnh thời gian** (mặc định 100 ms). Tự áp đúng đoạn đầu & đoạn cuối thành phẩm, kể cả khi có Intro/Outro |

---

## ✨ Tính năng

| Nhóm | Chi tiết |
|---|---|
| **4 ô kéo thả** | Video chính ⚠️ · Subtitle `.ass/.srt` ⚠️ · Intro · Outro — hiện tên file, độ phân giải, FPS, thời lượng, dung lượng; Intro/Outro mờ đi khi chưa bật ghép |
| **Engine phụ đề** | `VSFilterMod.dll` (mặc định) / `VSFilter.dll` / `libass` — **AviSynth+ bundle sẵn**, không cần cài hệ thống; tự gọi đúng hàm theo bản build (VSFilterMod → `TextSubMod`, xy-VSFilter → `TextSub`), DLL lỗi mới đổi DLL còn lại, lỗi runtime tự fallback libass |
| **Phần cứng** | Tự động (ưu tiên GPU) / NVIDIA NVENC / Intel QSV / AMD AMF / CPU x264-x265 — tự dò encoder, mục không có bị làm mờ |
| **Chất lượng** | Giữ nguyên gốc (Constrained VBR theo file gốc) / Cao / Cân bằng / Tiết kiệm / Tùy chỉnh (Resolution · FPS · Bitrate) |
| **Định dạng xuất** | `MP4` (mặc định) · `MKV` · `MOV` · `WebM` · `AVI` |
| **Ghép Intro/Outro** | Tự động scale + pad theo chuẩn video chính, concat 3 đoạn, đoạn câm được chèn audio tĩnh |
| **Tiến trình & Log** | Progress % · FPS · tốc độ `×` · **ETA dạng "X giờ X phút X giây"** · log thống kê mỗi 5% (frame/fps/bitrate/dung lượng) · **Copy toàn bộ log** |
| **Ngôn ngữ** | **Nút VI / EN trên header** — đổi ngay toàn bộ giao diện *và* log của engine, ghi nhớ lựa chọn |
| **UI** | Gọn trong 1 cửa sổ 1600×900, không scroll trang, nhẹ & mở nhanh, Error Boundary chống màn trắng |

---

## 🖱️ Cách sử dụng

1. **Mục 1 · File Nguồn**: kéo thả **Video chính** + **File Subtitle**. Muốn ghép đầu/cuối → tick **☑ Ghép Intro/Outro** rồi thả file vào 2 ô Intro/Outro. Bật **Fade đầu/cuối** nếu cần (nhập thời gian ms, mặc định 100).
2. **Xem trước** (cột phải, hiện ngay khi chọn video): play/pause, tiến-lùi 1 khung / 1s / 5s, kéo timeline — **dừng phát là frame phụ đề hiện ngay trên khung hình** (render bằng ffmpeg/libass đúng chuẩn bản render) để bạn kiểm tra đã load đúng file và mốc thời gian. Muốn **cắt đoạn A→B** → đặt mốc **A** và **B** bằng 2 nút trên timeline (mốc lấy theo vị trí đang phát), hoặc bấm **Export clip A→B** để xuất riêng đoạn đó (không phụ đề, giữ định dạng gốc).
3. **Mục 2 · Engine & Phần cứng**: để mặc định (`VSFilterMod.dll` + `Tự động`) nếu không rõ.
4. **Mục 3 · Chất Lượng Render**: *"Giữ nguyên gốc"* = file xuất gần như giống hệt nguồn, chỉ khác là đã có sub.
5. **Mục 4 · Output & Điều Khiển**: chọn thư mục lưu, tên file (mặc định `<tên_gốc>_exported`), **định dạng** → bấm **BẮT ĐẦU RENDER**. Theo dõi progress/ETA/log; xong bấm **Mở thư mục chứa file xuất**. Muốn dừng → **HỦY** (kill cả cây tiến trình FFmpeg).

---

## 📦 Tự build EXE portable

Yêu cầu: **Node 18+**, **Rust** (toolchain GNU đã ghim trong `rust-toolchain.toml`) và **WebView2**.

```bash
npm install
npm run check:bin              # kiểm tra bin/ (hướng dẫn tải nếu thiếu)
npm run build                  # build giao diện React → dist/
npm run tauri -- build --no-bundle
                               # → target/release/kull-app-backend.exe  (~98 MB)
```

Lúc biên dịch, `kull-app/src-tauri/build.rs` nén `bin/` + `WebView2Loader.dll` rồi nhúng thẳng vào exe (208 MB → 76 MB), nên **file exe sinh ra là bản portable duy nhất** — không cần `bin/` đi kèm. Đổi tên exe tùy ý.

> Đóng app đang chạy trước khi build/copy exe.
> Chạy dev: `npm run dev`.

### Cập nhật nội dung Release

```bash
node scripts/setReleaseNotes.js docs/release-notes-v2.1.0.md v2.1.0
```

> ⚠️ **Đừng dùng PowerShell để ghi release notes.** PowerShell 5 đọc file `.ps1` không BOM theo bảng mã ANSI (CP1252) nên tiếng Việt bị hỏng ngay trước khi gửi lên GitHub → release hiển thị dạng `ghĂ©p cá»©ng phá»¥ Ä‘á»‹`. Script Node ở trên đọc/ghi UTF-8 chuẩn, sau khi ghi còn **tự GET lại và so hash** để chắc chắn nội dung khớp file gốc.

---

## 🧪 Kiểm thử

```bash
cargo test -p kull-engine -- --test-threads=1   # probe + render + ghép intro/outro thật bằng bin/ffmpeg.exe
npm run test:i18n                               # song ngữ: parity từ điển + nút VI/EN + localStorage
npm run test:arrow-step                         # bundle thật (jsdom): mũi tên ←/→ tua đúng bước
npm run test:frame-step                         # hồi quy: nút "1 frame" lệch đúng 1 khung
node scripts/checkRows.js                       # cấu trúc layout mục 2 (nhóm nút theo hàng)
node scripts/checkQuality.js                    # cấu trúc mục 3 + console log
```

---

## 🧰 Toolkit bắt buộc trong `bin/`

| File | Nguồn |
|---|---|
| `ffmpeg.exe`, `ffprobe.exe` | https://www.gyan.dev/ffmpeg/builds/ (bản có `--enable-avisynth` + GPU encoders) |
| `AviSynth.dll` | https://github.com/AviSynth/AviSynthPlus/releases → gói `-filesonly.7z` (thư mục `x64`) |
| `avsplugins/DirectShowSource.dll` | đi kèm gói `-filesonly.7z` (thư mục `x64/plugins`) |
| `VSFilterMod.dll` | https://github.com/pinterf/VSFilterMod/releases |
| `VSFilter.dll` | https://github.com/cyberbeing/xy-VSFilter/releases (bản có TextSub cho AviSynth) |

Kiểm tra nhanh: `npm run check:bin`

---

## 🗂️ Cấu trúc

```
kull-app/
  src/          giao diện React (App.jsx · i18n.js · components/ · utils/ · renderAPI.ts)
  src-tauri/    backend Tauri (Rust): lệnh IPC, assets.rs giải nén, wv2.rs shim, build.rs nhúng bin/
kull-engine/    lõi render Rust: probe · subtitle · encoder · render · concat · trim · win (ẩn console)
src/            giao diện (Vite root)
scripts/        checkBin · checkI18n · checkRows · checkQuality · setReleaseNotes · createRelease
bin/            ffmpeg · ffprobe · AviSynth.dll · VSFilter*.dll · avsplugins/  (chỉ cần khi build)
```

---

## 📄 License

MIT — xem `package.json`.
