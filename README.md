# 🎬 Kull Vietsub Renderer

Ứng dụng Desktop **Render Video Vietsub Hardsub** — ghép cứng phụ đề ASS/SRT **thẳng vào hình ảnh** của video — **Electron + React + TailwindCSS**, lõi render bằng **FFmpeg + VSFilter (AviSynth+)**.

> 💡 **Hardsub là gì?** Là cách "in" phụ đề **cố định vào từng khung hình** của video khi render. File xuất ra mở bằng trình phát nào cũng tự hiện sub, **không cần mang theo file `.ass`/`.srt` rời** và **không thể tắt đi** (khác với **Softsub** — track phụ đề rời, có thể bật/tắt trong trình phát).

> ⚠️ Dự án ban đầu nhắm tới Tauri, nhưng máy hiện tại **chưa cài Rust/Cargo** → chuyển sang **Electron + React** (phương án thay thế được phép của đề bài).

---

## 📥 Tải bản dựng sẵn (không cần cài đặt)

**[KullVietsubRenderer-1.0.0-portable.exe (~161 MB)](https://github.com/zingky/kull-aegisub-renderer/releases/download/v1.0.0/KullVietsubRenderer-1.0.0-portable.exe)** — xem toàn bộ bản phát hành tại [Releases](https://github.com/zingky/kull-aegisub-renderer/releases).

- 1 file exe duy nhất, **chạy là dùng** — tự giải nén vào `%TEMP%`, không cài đặt, không đụng registry.
- Đã kèm sẵn toàn bộ toolkit: `ffmpeg`, `ffprobe`, `AviSynth.dll`, `VSFilterMod.dll`, `VSFilter.dll`, `DirectShowSource.dll`.
- Lần chạy đầu Windows SmartScreen có thể cảnh báo (chưa ký số) → **More info → Run anyway**.
- Yêu cầu: Windows 10/11 64-bit. Không cần cài thêm gì khác.

---

## ✨ Tính năng

| Nhóm | Chi tiết |
|---|---|
| **4 ô kéo thả** | Video chính ⚠️bắt buộc · Subtitle `.ass/.srt` ⚠️bắt buộc · Video Intro · Video Outro — tự hiển thị tên file, độ phân giải, FPS, thời lượng, dung lượng; Intro/Outro mờ đi khi chưa bật ghép |
| **Engine phụ đề** | `VSFilterMod.dll` (mặc định) / `VSFilter.dll` / `libass` (FFmpeg native) — **AviSynth+ đã bundle sẵn**, không cần cài đặt hệ thống; DLL thiếu `TextSub` được tự phát hiện và đổi sang DLL còn lại; cùng lỗi thì tự fallback libass |
| **Phần cứng mã hóa** | Tự động (ưu tiên GPU) / NVIDIA NVENC / Intel QSV / AMD AMF / CPU x264-x265 — tự dò encoder qua `ffmpeg -encoders`, mục không có bị làm mờ |
| **Chất lượng** | Giữ nguyên gốc (Auto Bitrate Constrained VBR) / Cao / Cân bằng / Tiết kiệm / Tùy chỉnh (Resolution · FPS · Bitrate) |
| **Định dạng xuất** | `MP4` (mặc định) · `MKV` · `MOV` · `WebM` · `AVI` — đuôi file xuất bám theo nút chọn |
| **Ghép Intro/Outro** | Scale+Pad tự động theo chuẩn video chính, concat 3 đoạn, đoạn câm được chèn audio tĩnh |
| **Tiến trình & Log** | Progress %, FPS render, tốc độ `×`, **ETA dạng chữ "X giờ X phút X giây"**, log thống kê chi tiết mỗi 5% (frame/fps/bitrate/dung lượng), **nút Copy toàn bộ log** |
| **Hoàn tất** | Báo thành công, nút "Mở thư mục chứa file", bắt lỗi chi tiết ra log, Hủy render an toàn |
| **UI** | Gọn trong 1 cửa sổ 1300×860, không scroll trang, hiệu ứng liquid-glass trên nút bấm, Error Boundary chống màn trắng |

Lộ trình 4 giai đoạn ban đầu: **UI/UX → FFmpeg Engine → Ghép Intro/Outro → Kết nối + Progress/Log — tất cả đều ✅ hoàn thành.**

---

## 🖱️ Cách sử dụng

1. **Kéo thả file vào mục 1 · File Nguồn**:
   - Ô **Video chính** (bắt buộc): `.mp4 .mkv .avi ...`
   - Ô **File Subtitle** (bắt buộc): `.ass .srt` — file Aegisub giữ nguyên hiệu ứng karaoke nếu render bằng VSFilter.
   - Muốn ghép đầu/cuối: **tick ☑ "Ghép Intro/Outro vào Video chính"** rồi thả video vào 2 ô *đoạn đầu / đoạn cuối*.
2. **Mục 2 · Engine & Phần cứng**: chọn engine phụ đề (để mặc định `VSFilterMod.dll` nếu không chắc) và bộ mã hóa (để **Tự động** để app ưu tiên GPU).
3. **Mục 3 · Chất Lượng Render**: chọn mức phù hợp. *"Giữ nguyên gốc" = render ra file gần như giống hệt nguồn, chỉ khác là đã có sub.*
4. **Mục 4 · Output & Điều Khiển**:
   - Thư mục lưu tự điền theo video chính; tên file mặc định `<tên>_exported`.
   - Chọn **định dạng xuất** (MP4/MKV/MOV/WebM/AVI).
   - Bấm **[ BẮT ĐẦU RENDER ]** — theo dõi Progress Bar, FPS, tốc độ, ETA; **[ HỦY ]** nếu muốn dừng.
   - Khi render: Console Log tự ghi thống kê mỗi 5% — bấm **Copy log** để chép toàn bộ log đi hỏi/báo lỗi.
   - Xong việc: bấm **Mở thư mục chứa file xuất**.

> 💡 Nếu chọn VSFilter mà DLL không chạy được (VD: bản `VSFilterMod.dll` DirectShow-only), app **tự đổi sang `VSFilter.dll`** và cuối cùng là **libass** — luôn có file xuất, kèm log giải thích rõ.

## 🚀 Chạy từ mã nguồn

```bash
# 1. Cài dependencies (Electron, React, Tailwind, ...)
npm install

# 2. Kiểm tra các file portable trong bin/
npm run check:bin

# 3a. Chạy dev (hot-reload, Vite + Electron)
npm run dev

# 3b. Hoặc build bản production rồi chạy
npm run build && npm start
```

> Mẹo: nếu `npm install` không tải được binary Electron (lỗi *Electron failed to install*), chạy lại `node node_modules/electron/install.js`.

### 📦 Cách tự build EXE portable (1 file)

```bash
npm run dist
# → release/KullVietsubRenderer-<version>-portable.exe  (~160 MB)
```

- Yêu cầu duy nhất: **Node.js ≥ 18** và đã `npm install` xong (electron-builder kéo theo).
- File exe chứa sẵn `dist/` (UI) + `electron/` (main) + `bin/` (toàn bộ toolkit) trong `resources/`.
- Đóng **mọi cửa sổ app đang mở** trước khi build — nếu không electron-builder sẽ lỗi khóa file `win-unpacked`.
- Muốn bản thư mục (không nén 1 file): `npx electron-builder --dir` → `release/win-unpacked/`.

---

## 📁 Cấu trúc dự án

```
kull-aegisub-renderer/
├── bin/                      # Các file portable ⚠️ BẮT BUỘC
│   ├── ffmpeg.exe              #   (build gyan.dev có avisynth + GPU encoders)
│   ├── ffprobe.exe
│   ├── AviSynth.dll            #   Core AviSynth+ 64-bit (portable, cạnh ffmpeg.exe)
│   ├── avsplugins/             #   DirectShowSource.dll (+ plugin chuẩn của AviSynth+)
│   ├── VSFilterMod.dll
│   └── VSFilter.dll
├── electron/                  # Main process (Node.js)
│   ├── main.js                #   BrowserWindow + toàn bộ IPC
│   ├── preload.js             #   contextBridge → window.renderAPI
│   ├── ffmpegEngine.js        #   🧠 Core Engine (probe/VBR/sub/scale-pad/concat/progress)
│   └── paths.js               #   Resolve đường dẫn bin/ (source & packaged)
├── src/                       # Renderer (React + TailwindCSS + Vite)
│   ├── App.jsx                #   State trung tâm + luồng render
│   ├── components/            #   DropZone, EngineSelect, HardwareSelect, QualitySelect,
│   │                          #   MergeToggle, OutputControls, ProgressPanel, ConsoleLog,
│   │                          #   ErrorBoundary (chống màn trắng)
│   └── utils/format.js        #   formatDuration / formatEta / formatBytes / path helpers
├── scripts/                   # Kiểm thử & tiện ích
│   ├── checkBin.js            #   npm run check:bin
│   ├── e2eTest.js             #   npm run test:e2e — render thật end-to-end
│   ├── repro-select.js        #   npm run test:repro — hồi quy lỗi màn trắng
│   ├── test-vsfilter.js       #   Render thật VSFilter qua AviSynth bundled
│   ├── test-avs-dlls.js       #   Kiểm TextSub của từng DLL
│   ├── checkRows.js           #   Kiểm tra cấu trúc layout mục 2
│   └── checkQuality.js        #   Kiểm tra layout mục 3 + log + glass
└── package.json
```

## 🧠 Cơ chế hoạt động (Core Engine)

1. **ffprobe đọc thông số gốc**: `width`, `height`, `fps`, `bitrate_avg`, codec. `bitrate_max` mặc định = `bitrate_avg × 1.25` nếu không đọc được đỉnh phân cảnh.

2. **Auto Bitrate — Constrained VBR** (`qualityArgs`):

   | Chế độ | Video bitrate | maxrate | bufsize | Nhận xét |
   |---|---|---|---|---|
   | Giữ nguyên gốc | `bitrate_avg` | `×1.25` | `×2` | giữ 100% độ phân giải/fps/codec |
   | Chất lượng cao | `×0.75` | `×1.0` | `×1.5` | nét ~90–95%, dung lượng ~70–80% |
   | Cân bằng | `×0.55` | `×0.7` | `×1.1` | tối ưu chia sẻ MXH |
   | Tiết kiệm | `×0.32` | `×0.45` | `×0.7` | nén tối đa |
   | Tùy chỉnh | user | `×1.25` | `×2` | nhập W×H, FPS, Bitrate |

   - CPU: `libx264/libx265 -preset slow/medium/fast` (theo chất lượng).
   - GPU: `h264_nvenc -rc vbr -preset p6 -tune hq -multipass qres` (Intel QSV / AMD AMF tương ứng).
   - Luôn ép `-pix_fmt yuv420p` cho tương thích mọi trình phát.

3. **Subtitle** (`buildSubtitlePlan`):
   - **libass**: `-vf "subtitles='path.ass'"` — path được **escape chuẩn Windows**: `C:\Kho Phim\Tập 1.ass` → `C\:/Kho Phim/Tập 1.ass`.
   - **AviSynth+ bundled (portable)** — chạy VSFilter mà không cần cài đặt hệ thống:
     - `bin/AviSynth.dll` đặt **cạnh `ffmpeg.exe`** → FFmpeg (demuxer `avisynth`) tự `LoadLibrary`, không cần registry.
     - Engine sinh script `.avs` tạm:
       ```avs
       SetFilterMTMode("DEFAULT_MT_MODE", 2)
       LoadPlugin("bin/VSFilter.dll")
       LoadPlugin("bin/avsplugins/DirectShowSource.dll")
       DirectShowSource("video.mp4", fps=23.976, convertfps=true)
       TextSub("phụ đề.ass")
       ```
     - **Preflight test**: trước khi render, thử xuất 1 frame → xác nhận DLL thực sự có `TextSub`. `VSFilterMod.dll` bản DirectShow-only (không có TextSub) → **tự đổi sang `VSFilter.dll`** với log rõ ràng.
     - Không chạy được (thiếu codec/DLL) → cảnh báo + **fallback libass**; lỗi giữa lúc render → **tự render lại bằng libass**. Luôn có output.

4. **Ghép Intro/Outro** (`buildRenderCommand`):
   - Lấy `W/H/FPS` của **video chính làm chuẩn** (hoặc giá trị custom).
   - Intro/Outro qua filter: `scale=W:H:force_original_aspect_ratio=decrease,pad=W:H:(ow-iw)/2:(oh-ih)/2:black,fps=FPS,setsar=1`
   - Ghép bằng `concat`: `[intro_v][intro_a][main_v][main_a][outro_v][outro_a]concat=n=3:v=1:a=1[vout][aout]`.
   - Đoạn không có audio được chèn `anullsrc` (audio câm) để concat không lỗi.

5. **Render & Progress** (`startRender`): `child_process.spawn` → parse `stderr`:
   - `time=HH:MM:SS[.ms]` → % = thời gian đã xử lý / tổng thời lượng.
   - `fps=...` → FPS render; `speed=...×`; `frame=`, `bitrate=`, `size=` → log thống kê chi tiết mỗi 5%.
   - **ETA** = thời lượng còn lại ÷ tốc độ — hiển thị dạng chữ *"X giờ X phút X giây"*.
   - Console Log có **nút Copy** (Clipboard API + fallback `execCommand`).
   - exit code ≠ 0 → in chi tiết lỗi ra Console Log; `HỦY` → `taskkill /T /F` giết cả cây tiến trình FFmpeg.

---

## 🧪 Kiểm thử

```bash
npm run test:e2e      # Tạo video mẫu + render thật (libass + ghép outro) bằng đúng bin/ffmpeg.exe
npm run test:repro    # Hồi quy: chọn file video không được làm crash UI (jsdom + bundle thật)
node scripts/test-vsfilter.js   # Render thật VSFilter qua AviSynth+ bundled (auto-swap VSFilterMod→VSFilter)
node scripts/test-avs-dlls.js   # Kiểm tra TextSub của từng DLL trong bin qua AviSynth
node scripts/checkRows.js       # Cấu trúc layout mục 2 (VSFilter×2 / libass / NVENC+AMD / QSV+CPU / Tự động)
node scripts/checkQuality.js    # Cấu trúc mục 3 (2 hàng) + console log trong cột phải + glass buttons
```

---

## 🧰 Toolkit bắt buộc trong `bin/`

| File | Nguồn |
|---|---|
| `ffmpeg.exe`, `ffprobe.exe` | https://www.gyan.dev/ffmpeg/builds/ (bản có `--enable-avisynth`, GPU encoders) |
| `AviSynth.dll` | https://github.com/AviSynth/AviSynthPlus/releases → bản `-filesonly.7z` (thư mục `x64`) |
| `avsplugins/DirectShowSource.dll` | đi kèm trong gói `-filesonly.7z` ở trên (thư mục `x64/plugins`) |
| `VSFilterMod.dll` | https://github.com/pinterf/VSFilterMod/releases |
| `VSFilter.dll` | https://github.com/cyberbeing/xy-VSFilter/releases (bản có TextSub cho AviSynth) |

Kiểm tra nhanh: `npm run check:bin`

---

## 📄 License

MIT — xem `package.json`.


