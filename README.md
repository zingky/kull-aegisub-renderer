# 🎬 Kull Vietsub Renderer

Ứng dụng Desktop **Render Video Vietsub Hardsub** (đốt phụ đề ASS/SRT vào video) — xây dựng bằng **Electron + React + TailwindCSS**, lõi render bằng **FFmpeg + VSFilter (AviSynth)**.

> ⚠️ Lưu ý: Dự án ban đầu nhắm tới Tauri, nhưng máy hiện tại **chưa cài Rust/Cargo** → chuyển sang **Electron + React** theo đúng phương án thay thế được phép (`Tauri + React + TailwindCSS (hoặc Electron + React)`).

---

## ✨ Tính năng (theo lộ trình 4 giai đoạn)

| Giai đoạn | Nội dung | Hiện trạng |
|---|---|---|
| **1** | UI/UX All-in-One: 4 ô kéo thả, radio Engine/Hardware/Quality, checkbox ghép Intro/Outro, Output & Control, Progress Bar, Console Log | ✅ |
| **2** | Module FFmpeg Engine: ffprobe đọc thông số gốc, thuật toán Auto Bitrate (Constrained VBR), xử lý Subtitle DLL (**AviSynth+ bundled** + VSFilterMod/VSFilter/libass), escape path Windows | ✅ |
| **3** | Ghép Intro/Outro: tự động Scale+Pad theo chuẩn video chính, concat filter, xử lý audio câm | ✅ |
| **4** | Kết nối UI ↔ Engine, spawn FFmpeg, parse `time=`/`fps=`/`speed=`, Progress %, ETA, Console Log, Bắt lỗi, Hủy render, Mở thư mục | ✅ |

---

## 🚀 Cài đặt & Chạy

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

> Mẹo: nếu `npm install` không tải được binary Electron (lỗi *Electron failed to install*),
> chạy lại `node node_modules/electron/install.js`.

### 📦 Đóng gói Portable EXE (1 file, không cần cài đặt)

```bash
npm run dist
# → release/KullVietsubRenderer-<version>-portable.exe  (~160 MB)
```

- Chạy file là app tự giải nén vào `%TEMP%` và mở ngay — **không cài đặt, không đụng registry**.
- Toàn bộ toolkit (`ffmpeg`, `ffprobe`, `AviSynth.dll`, `VSFilter*.dll`) nằm trong `resources/bin` của chính file exe.
- Lần chạy đầu windows SmartScreen có thể cảnh báo (không có chữ ký số) → chọn **More info → Run anyway**.

---

## 📁 Cấu trúc dự án

```
kull-aegisub-renderer/
├── bin/                      # Các file portable ⚠️ BẮT BUỘC
│   ├── ffmpeg.exe             #   (build gyan.dev có avisynth + GPU encoders)
│   ├── ffprobe.exe
│   ├── AviSynth.dll           #   Core AviSynth+ 64-bit (portable, nằm cạnh ffmpeg.exe)
│   ├── avsplugins/            #   DirectShowSource.dll (+ plugin chuẩn của AviSynth+)
│   ├── VSFilterMod.dll
│   └── VSFilter.dll
├── electron/                  # Main process (Node.js)
│   ├── main.js                #   BrowserWindow + toàn bộ IPC
│   ├── preload.js             #   contextBridge → window.renderAPI
│   ├── ffmpegEngine.js        #   🧠 Core Engine (probe/VBR/sub/scale-pad/concat/progress)
│   └── paths.js               #   Resolve đường dẫn bin/
├── src/                       # Renderer (React + TailwindCSS + Vite)
│   ├── App.jsx                # State trung tâm + luồng render
│   ├── components/            # DropZone, EngineSelect, HardwareSelect, QualitySelect,
│   │                          # MergeToggle, OutputControls, ProgressPanel, ConsoleLog
│   └── utils/format.js
├── scripts/
│   ├── checkBin.js            # Kiểm tra bin/ (npm run check:bin)
│   ├── e2eTest.js             # Test end-to-end render thật (npm run test:e2e)
│   └── test-vsfilter.js       # Test fallback VSFilter → libass
├── index.html / vite.config.mjs / tailwind.config.cjs / postcss.config.cjs
└── package.json
```

---

## ⚙️ Cách hoạt động Core Engine (`electron/ffmpegEngine.js`)

1. **Đọc thông số gốc** (`probeMedia`): chạy `ffprobe -print_format json -show_format -show_streams`
   → lấy `width`, `height`, `fps` (từ `avg_frame_rate`), `bitrate_avg`, codec, audio, dung lượng.

2. **Auto Bitrate** (`qualityArgs`) — Constrained VBR:

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
   - **libass**: `-vf "subtitles='path.ass'"` — path được **escape chuẩn Windows**:
     `C:\Kho Phim\Tập 1.ass` → `C\:/Kho Phim/Tập 1.ass`.
   - **AviSynth+ bundled (portable)** — chạy VSFilter mà không cần cài đặt hệ thống:
     - `bin/AviSynth.dll` đặt **cạnh `ffmpeg.exe`** → FFmpeg (demuxer `avisynth`) tự `LoadLibrary` mà không cần registry.
     - Engine sinh script `.avs` tạm:
       ```avs
       SetFilterMTMode("DEFAULT_MT_MODE", 2)
       LoadPlugin("bin/VSFilter.dll")
       LoadPlugin("bin/avsplugins/DirectShowSource.dll")
       DirectShowSource("video.mp4", fps=23.976, convertfps=true)
       TextSub("phụ đề.ass")
       ```
     - **Preflight test**: trước khi render, engine thử xuất 1 frame → xác nhận DLL thực sự có hàm `TextSub`.
       `VSFilterMod.dll` hiện tại là bản DirectShow-only (không có TextSub) → **tự đổi sang `VSFilter.dll`** (xy-VSFilter) có log rõ ràng.
     - Vẫn không chạy được (thiếu DirectShow codec / không có AviSynth core) → cảnh báo và **tự fallback libass**. Nếu lỗi phát sinh giữa lúc render → **tự render lại bằng libass**. Luôn có output.

4. **Ghép Intro/Outro** (`buildRenderCommand`):
   - Lấy `W/H/FPS` của **video chính làm chuẩn** (hoặc giá trị custom).
   - Intro/Outro qua filter:
     ```
     scale=W:H:force_original_aspect_ratio=decrease,pad=W:H:(ow-iw)/2:(oh-ih)/2:black,fps=FPS,setsar=1
     ```
   - Ghép luồng bằng `concat`:
     ```
     [intro_v][intro_a][main_v][main_a][outro_v][outro_a]concat=n=3:v=1:a=1[vout][aout]
     ```
   - Đoạn không có audio được chèn `anullsrc` (audio câm) để concat không lỗi.

5. **Render & Progress** (`startRender`): `child_process.spawn` → parse `stderr`:
   - `time=HH:MM:SS[.ms]` → % = thời gian đã xử lý / tổng thời lượng.
   - `fps=...` → FPS render; `speed=...×` → ETA.
   - exit code ≠ 0 → in chi tiết lỗi ra Console Log.
   - `HỦY` → `taskkill /T /F` giết cả cây tiến trình FFmpeg.

---

## 🧪 Kiểm thử

```bash
npm run test:e2e    # Tạo video mẫu + render thật (libass + ghép outro) bằng đúng bin/ffmpeg.exe
node scripts/test-vsfilter.js   # Render thật với VSFilter qua AviSynth+ bundled (gồm auto-swap VSFilterMod→VSFilter)
node scripts/test-avs-dlls.js   # Kiểm tra TextSub của từng DLL trong bin qua AviSynth
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
