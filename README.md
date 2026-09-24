# 🎬 Kull Aegisub Renderer

**Tiếng Việt** · [English](./README.en.md)

App desktop **ghép cứng phụ đề ASS/SRT vào video (Hardsub)** — **Electron + React + TailwindCSS**, lõi render **FFmpeg + VSFilter (AviSynth+)**.


---

## 🖼️ Giao diện

<img width="2556" height="1512" alt="Kull Aegisub Renderer - UI" src="https://github.com/user-attachments/assets/b6461381-cecc-4ef3-af4a-22b3be0c4f76" />

---

## 📥 Tải bản dựng sẵn (không cần cài đặt)

Mọi bản phát hành ở [Releases](https://github.com/zingky/kull-aegisub-renderer/releases/tag/v2.0.0). Có 2 lựa chọn:

| Bản | Dung lượng | Mở app | Ghi chú |
|---|---|---|---|
| **[ZIP - win-x64](https://github.com/zingky/kull-aegisub-renderer/releases/download/v2.0.0/KullAegisubRenderer-2.0.0-win-x64.zip)** ⭐ | ~194 MB | **~0.4 giây** | Nhanh nhất — giải nén 1 lần rồi chạy |
| **[Portable .exe](https://github.com/zingky/kull-aegisub-renderer/releases/download/v2.0.0/KullAegisubRenderer-2.0.0-portable.exe)** | ~130 MB | 6-12 giây | 1 file duy nhất, tiện mang theo |

### Cách dùng bản ZIP (khuyến nghị)

1. Tải `KullAegisubRenderer-2.0.0-win-x64.zip` → chuột phải → **Extract All…** ra thư mục bất kỳ (VD `D:\KullAegisubRenderer`).
2. Vào thư mục vừa giải nén → chạy **`Kull Aegisub Renderer.exe`**.
3. Lần đầu SmartScreen có thể cảnh báo (app chưa ký số) → **More info → Run anyway**. Từ lần sau mở chỉ ~0.4 giây.

> ⚠️ **Đừng chạy exe trực tiếp bên trong file ZIP.** Windows sẽ tự bung tạm ra `%TEMP%` mỗi lần mở (chậm y như bản portable) và có thể lỗi thiếu file. Phải giải nén ra thư mục trước.
>
> ⚠️ Giữ nguyên toàn bộ file trong thư mục đã giải nén (các `.dll`, `locales/`, `resources/`) — thiếu 1 file là app không chạy.

### Cách dùng bản Portable

Double-click file exe là xong — không cài đặt, không đụng registry, xóa file là gỡ sạch. Đổi lại mỗi lần mở app phải chờ 6-12 giây để nó tự bung 510 MB ra `%TEMP%`.

- Yêu cầu **Windows 10/11 64-bit**. Kèm sẵn toolkit: `ffmpeg`, `ffprobe`, `AviSynth.dll`, `VSFilterMod.dll`, `VSFilter.dll`, `DirectShowSource.dll`.

---

## 🆕 Có gì mới ở 2.0

| Tính năng | Chi tiết |
|---|---|
| 🎬 **Xem trước trong app** | Chọn video là player hiện ra: play/pause, tiến-lùi **1 khung · 1s · 5s**, timeline thumbnail, **xem trước phụ đề ngay trên khung hình** — kiểm tra đã load đúng video/sub trước khi render |
| ✂️ **Cắt đoạn A → B** | Đặt mốc A/B bằng nút → render chỉ xuất đúng đoạn đã chọn |
| ⬇️ **Export clip A→B** | Xuất riêng đoạn A→B **không phụ đề**, **giữ nguyên định dạng gốc** |
| 🌓 **Fade đầu / cuối** | Bật/tắt + **tuỳ chỉnh thời gian** (mặc định 100 ms). Tự áp đúng đoạn đầu & đoạn cuối thành phẩm, kể cả khi có Intro/Outro |

---

## ✨ Tính năng

| Nhóm | Chi tiết |
|---|---|
| **4 ô kéo thả** | Video chính ⚠️ · Subtitle `.ass/.srt` ⚠️ · Intro · Outro — hiện tên file, độ phân giải, FPS, thời lượng, dung lượng; Intro/Outro mờ đi khi chưa bật ghép |
| **Engine phụ đề** | `VSFilterMod.dll` (mặc định) / `VSFilter.dll` / `libass` — **AviSynth+ bundle sẵn**, không cần cài hệ thống; DLL thiếu `TextSub` tự đổi sang DLL còn lại, lỗi runtime tự fallback libass |
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
2. **Xem trước** (cột phải, hiện ngay khi chọn video): play/pause, tiến-lùi 1 khung / 1s / 5s, kéo timeline — phụ đề hiện luôn trên khung hình để bạn kiểm tra đã load đúng file chưa. Muốn **cắt đoạn A→B** → đặt mốc **A** và **B** bằng 2 nút trên timeline (mốc lấy theo vị trí đang phát), hoặc bấm **Export clip A→B** để xuất riêng đoạn đó (không phụ đề, giữ định dạng gốc).
3. **Mục 2 · Engine & Phần cứng**: để mặc định (`VSFilterMod.dll` + `Tự động`) nếu không rõ.
4. **Mục 3 · Chất Lượng Render**: *"Giữ nguyên gốc"* = file xuất gần như giống hệt nguồn, chỉ khác là đã có sub.
5. **Mục 4 · Output & Điều Khiển**: chọn thư mục lưu, tên file (mặc định `<tên_gốc>_exported`), **định dạng** → bấm **BẮT ĐẦU RENDER**. Theo dõi progress/ETA/log; xong bấm **Mở thư mục chứa file xuất**. Muốn dừng → **HỦY** (kill cả cây tiến trình FFmpeg).

---

## 📦 Tự build EXE portable

```bash
npm install
npm run check:bin    # kiểm tra bin/ (hướng dẫn tải nếu thiếu)
npm run dist         # → release/KullAegisubRenderer-<version>-portable.exe  (~129 MB)
                     #   release/KullAegisubRenderer-<version>-win-x64.zip   (~191 MB, mở app ~0.4s)
```

> Đóng app đang chạy trước khi build (file trong `release/win-unpacked` bị khóa sẽ làm build lỗi).
> Chạy dev: `npm run dev` · chạy bản build: `npm start`.

### Cập nhật nội dung Release

```bash
node scripts/setReleaseNotes.js docs/release-notes-v2.0.0.md v2.0.0
```

> ⚠️ **Đừng dùng PowerShell để ghi release notes.** PowerShell 5 đọc file `.ps1` không BOM theo bảng mã ANSI (CP1252) nên tiếng Việt bị hỏng ngay trước khi gửi lên GitHub → release hiển thị dạng `ghĂ©p cá»©ng phá»¥ Ä‘á»‹`. Script Node ở trên đọc/ghi UTF-8 chuẩn, sau khi ghi còn **tự GET lại và so hash** để chắc chắn nội dung khớp file gốc.

---

## 🧪 Kiểm thử

```bash
npm run test:e2e      # tạo video mẫu + render thật (libass + ghép outro) bằng bin/ffmpeg.exe
npm run test:repro    # hồi quy: chọn file không được làm crash UI (jsdom + bundle thật)
npm run test:i18n     # song ngữ: parity từ điển + nút VI/EN đổi UI + lưu localStorage
npm run test:trim     # render thật: cắt A→B, fade đầu/cuối (đo luminance), export clip A→B
node scripts/checkRows.js       # cấu trúc layout mục 2 (nhóm nút theo hàng)
node scripts/checkQuality.js    # cấu trúc mục 3 + console log + nút không còn hiệu ứng nặng
node scripts/test-vsfilter.js   # render thật qua AviSynth+ (auto-swap VSFilterMod → VSFilter)
node scripts/test-avs-dlls.js   # kiểm tra TextSub của từng DLL trong bin
node scripts/checkIcon.ps1      # kiểm tra icon trong exe (đối chiếu hash pixel với build/icon.ico)
```

Kiểm tra bản ZIP đã giải nén (engine + `bin/` trong `resources/`) chạy đúng từ thư mục bất kỳ:

```powershell
$env:ELECTRON_RUN_AS_NODE='1'
& "<thư_mục_đã_giải_nén>\Kull Aegisub Renderer.exe" scripts/zipRenderTest.js
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
electron/   main.js (IPC) · preload.js · ffmpegEngine.js (Core Engine) · i18n.js · paths.js
src/        App.jsx · i18n.js (từ điển VI/EN) · components/ (8 UI + LangSwitch + ErrorBoundary) · utils/
scripts/    checkBin · e2eTest · repro-select · checkI18n · checkRows · checkQuality · test-vsfilter · test-avs-dlls · zipRenderTest · afterPackIcon · setReleaseNotes
bin/        ffmpeg · ffprobe · AviSynth.dll · VSFilter*.dll · avsplugins/
```

---

## 📄 License

MIT — xem `package.json`.
