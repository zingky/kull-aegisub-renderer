# 🎬 Kull Aegisub Renderer

[Tiếng Việt](./README.md) · **English**

Desktop app that **burns (hardsubs) ASS/SRT subtitles into video** — **Electron + React + TailwindCSS**, render core powered by **FFmpeg + VSFilter (AviSynth+)**.


---

## 🖼️ Screenshot

<img width="2556" height="1512" alt="Kull Aegisub Renderer — main UI" src="https://github.com/user-attachments/assets/b6461381-cecc-4ef3-af4a-22b3be0c4f76" />

---

## 📥 Prebuilt download (no installation)

All builds on [Releases](https://github.com/zingky/kull-aegisub-renderer/releases/tag/v1.0.0). Two options:

| Build | Size | Startup | Notes |
|---|---|---|---|
| **[ZIP - win-x64](https://github.com/zingky/kull-aegisub-renderer/releases/download/v1.0.0/KullAegisubRenderer-1.0.0-win-x64.zip)** ⭐ | ~191 MB | **~0.4 s** | Fastest — extract once, then run |
| **[Portable .exe](https://github.com/zingky/kull-aegisub-renderer/releases/download/v1.0.0/KullAegisubRenderer-1.0.0-portable.exe)** | ~129 MB | 6-12 s | Single file, easy to carry around |

### How to use the ZIP build (recommended)

1. Download `KullAegisubRenderer-1.0.0-win-x64.zip` → right-click → **Extract All…** into any folder (e.g. `D:\KullAegisubRenderer`).
2. Open that folder and run **`Kull Aegisub Renderer.exe`**.
3. On first launch SmartScreen may warn (unsigned app) → **More info → Run anyway**. Afterwards it opens in ~0.4 s.

> ⚠️ **Do not run the exe directly inside the ZIP file.** Windows silently extracts it to `%TEMP%` on every launch (as slow as the portable build) and paths may break. Always extract to a folder first.
>
> ⚠️ Keep every file in the extracted folder (the `.dll`s, `locales/`, `resources/`) — the app will not start if any is missing.

### How to use the Portable build

Just double-click the exe — no install, no registry changes, delete the file to uninstall. In exchange, every launch waits 6-12 s while it unpacks 510 MB into `%TEMP%`.

- Requires **Windows 10/11 64-bit**. Bundled toolkit: `ffmpeg`, `ffprobe`, `AviSynth.dll`, `VSFilterMod.dll`, `VSFilter.dll`, `DirectShowSource.dll`.

---

## ✨ Features

| Group | Details |
|---|---|
| **4 drop zones** | Main video ⚠️ · Subtitle `.ass/.srt` ⚠️ · Intro · Outro — shows file name, resolution, FPS, duration, size; Intro/Outro are dimmed until merging is enabled |
| **Subtitle engine** | `VSFilterMod.dll` (default) / `VSFilter.dll` / `libass` — **AviSynth+ is bundled**, no system install needed; a DLL lacking `TextSub` is auto-swapped to the other one, runtime failures auto-fallback to libass |
| **Hardware encoder** | Auto (prefer GPU) / NVIDIA NVENC / Intel QSV / AMD AMF / CPU x264-x265 — encoders are detected, unavailable ones are dimmed |
| **Quality** | Keep original (Constrained VBR from source) / High / Balanced / Small size / Custom (Resolution · FPS · Bitrate) |
| **Output format** | `MP4` (default) · `MKV` · `MOV` · `WebM` · `AVI` |
| **Intro/Outro merge** | Auto scale + pad to the main video standard, 3-segment concat, silent segments get generated audio |
| **Progress & Log** | Progress % · FPS · speed `×` · **text ETA ("1 h 23 min 45 s")** · stats logged every 5% (frame/fps/bitrate/size) · **Copy whole log** |
| **Language** | **VI / EN switch on the header** — switches the whole UI *and* engine logs instantly, remembers your choice |
| **UI** | Compact single 1300×860 window, no page scrolling, lightweight & fast to open, Error Boundary to prevent blank screens |

---

## 🖱️ How to use

1. **Section 1 · Source Files**: drop the **main video** + **subtitle file**. To merge clips, tick **☑ Merge Intro/Outro** then drop the Intro/Outro files.
2. **Section 2 · Engine & Hardware**: keep the defaults (`VSFilterMod.dll` + `Auto`) if unsure.
3. **Section 3 · Render Quality**: *"Keep original"* produces a file nearly identical to the source — only with the subtitles burned in.
4. **Section 4 · Output & Controls**: pick the output folder, file name (default `<source_name>_exported`), **format** → press **START RENDER**. Watch progress/ETA/logs; when done, press **Open output folder**. To stop, press **CANCEL** (kills the whole FFmpeg process tree).

---

## 📦 Build your own

```bash
npm install
npm run check:bin    # verify bin/ (prints download instructions if missing)
npm run dist         # → release/KullAegisubRenderer-<version>-portable.exe  (~129 MB)
                     #   release/KullAegisubRenderer-<version>-win-x64.zip   (~191 MB, starts in ~0.4s)
```

> Close any running app instance before building (locked files in `release/win-unpacked` break the build).
> Dev mode: `npm run dev` · built app: `npm start`.

---

## 🧪 Tests

```bash
npm run test:e2e      # creates a sample video + real render (libass + outro merge) with bin/ffmpeg.exe
npm run test:repro    # regression: selecting a file must not crash the UI (jsdom + real bundle)
npm run test:i18n     # bilingual: dictionary parity + VI/EN switch changes UI + localStorage persistence
node scripts/checkRows.js       # section 2 layout structure (buttons grouped per row)
node scripts/checkQuality.js    # section 3 structure + console log + no heavy button effects
node scripts/test-vsfilter.js   # real render through AviSynth+ (auto-swap VSFilterMod → VSFilter)
node scripts/test-avs-dlls.js   # checks TextSub support of each DLL in bin/
node scripts/checkIcon.ps1      # verify exe icon (pixel-hash against build/icon.ico)
```

Verify an extracted ZIP build (engine + `bin/` inside `resources/`) runs from any folder:

```powershell
$env:ELECTRON_RUN_AS_NODE='1'
& "<extracted_folder>\Kull Aegisub Renderer.exe" scripts/zipRenderTest.js
```
```

---

## 🧰 Required toolkit in `bin/`

| File | Source |
|---|---|
| `ffmpeg.exe`, `ffprobe.exe` | https://www.gyan.dev/ffmpeg/builds/ (build with `--enable-avisynth` + GPU encoders) |
| `AviSynth.dll` | https://github.com/AviSynth/AviSynthPlus/releases → `-filesonly.7z` package (`x64` folder) |
| `avsplugins/DirectShowSource.dll` | included in the `-filesonly.7z` package above (`x64/plugins` folder) |
| `VSFilterMod.dll` | https://github.com/pinterf/VSFilterMod/releases |
| `VSFilter.dll` | https://github.com/cyberbeing/xy-VSFilter/releases (TextSub build for AviSynth) |

Quick check: `npm run check:bin`

---

## 🗂️ Project structure

```
electron/   main.js (IPC) · preload.js · ffmpegEngine.js (core engine) · i18n.js · paths.js
src/        App.jsx · i18n.js (VI/EN dictionaries) · components/ (8 UI + LangSwitch + ErrorBoundary) · utils/
scripts/    checkBin · e2eTest · repro-select · checkI18n · checkRows · checkQuality · test-vsfilter · test-avs-dlls · zipRenderTest · afterPackIcon
bin/        ffmpeg · ffprobe · AviSynth.dll · VSFilter*.dll · avsplugins/
```

---

## 📄 License

MIT — see `package.json`.
