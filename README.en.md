# 🎬 Kull Aegisub Renderer

[Tiếng Việt](./README.md) · **English**

Desktop app that **burns (hardsubs) ASS/SRT subtitles into video** — **Tauri + Rust + React + TailwindCSS**, render core powered by **FFmpeg + VSFilter (AviSynth+)**.


---

## 🖼️ Screenshot

<img width="2556" height="1512" alt="Kull Aegisub Renderer — main UI" src="https://github.com/user-attachments/assets/b6461381-cecc-4ef3-af4a-22b3be0c4f76" />

---

## 📥 Download (a single exe, nothing else)

[Latest release](https://github.com/zingky/kull-aegisub-renderer/releases/latest) — download **one `.exe`**, no installer, no manual unzipping.

**[⬇️ Download KullAegisubRenderer-2.1.0.exe](https://github.com/zingky/kull-aegisub-renderer/releases/download/v2.1.0/KullAegisubRenderer-2.1.0.exe)** (~98 MB)

1. Double-click the downloaded file. On first launch SmartScreen may warn (unsigned app) → **More info → Run anyway**.
2. **On first launch** the app extracts ffmpeg/ffprobe/AviSynth/VSFilter into `%LOCALAPPDATA%\Kull Aegisub Renderer` (~208 MB, a few seconds). Later launches are near-instant.
3. The `.exe` can live anywhere (Desktop, USB stick, Downloads…) — the extracted data is shared, and no `bin/` folder needs to travel with it.

> ✅ No FFmpeg/AviSynth/VSFilter installation needed. No registry changes. To uninstall: delete the exe and `%LOCALAPPDATA%\Kull Aegisub Renderer`.
>
> 💡 Requires **Windows 10/11 64-bit** and **WebView2** (built into Windows 11; usually present on Windows 10 via Microsoft Edge).

---

## ✨ What's new in 2.1.0

- **Exactly one exe**: ffmpeg, ffprobe, AviSynth, VSFilter, VSFilterMod, DirectShowSource and WebView2Loader are embedded in the exe and extracted on first run. No more side-by-side `bin/` folder.
- **No more CMD window**: the app runs as a GUI process and every ffmpeg/ffprobe/taskkill child is console-hidden.
- **A→B clip export keeps audio**, shows progress % and writes detailed lines to the Console Log.
- **More robust intro/outro merging**, including silent videos and dotted filenames (e.g. `East Of Eden [Full Ver.]`).

## ✨ What's new in 2.0.3

- **Arrow ←/→ now seeks by the step you picked**: click **1 frame** / **±1s** / **±5s** and the arrows follow that exact step; nothing clicked yet → **1 second** (default). The selected button glows with a green ring and a `← → step 1s` label shows above the clock. **Shift + ←/→** still jumps ±5s.

## 🐛 Fixed in 2.0.2

- **No more “buzzing” distortion on Facebook**: the A→B clip used to peak above 0 dBFS (True Peak +1.4 dBFS), so Facebook normalised then re-compressed it and clipped the peaks. The engine now caps the peak at **−1.5 dBFS** when exporting the clip (both MP4 and WebM).
- **WebM export works now**: choosing `.webm` used to make FFmpeg fail with exit `-22` (no file created) because it was forced into H.264/AAC — both the main render and the clip now use **VP9 + Opus**.
- **A→B clip extension follows the selected format**: it used to take the extension from the **source file**, so picking MP4 while the source was `.mkv` still produced `.mkv`.
- **Accurate “1 frame” step buttons**: they used to add `1/fps` (a float) and drift; now they step on the **integer frame index** and show the **frame number** next to the clock.
- **Accurate GPU encoder detection**: the app used to report “AMF/QSV available” just from the encoder list, even when `amfrt64.dll` was missing → the render died mid-way. It now **does a real 256×256 test encode** before reporting support.
- **Output file size / ETA / render time**: fixed parsing FFmpeg 9’s size line (it uses `KiB`/`MiB`, not `kB`/`MB`), steadier ETA, and the log now reports the **real render time**.
- **Preview auto-stops when rendering**: if a preview is playing when you press render, it stops → no CPU contention.

## 🐛 Fixed in 2.0.1

- **VSFilterMod effects now actually render**: `VSFilterMod.dll` registers the AviSynth function **`TextSubMod`** (not `TextSub`) → the app used to call the wrong name, silently fell back to `VSFilter.dll`/libass and **lost the effects** (`\distort`, `\jitter`, `\1img…`). The engine now picks the right function per build, and **the in-app preview renders with the selected engine too** (badge shows `ASS live ✓ · TextSubMod`).
- **Accurate ETA**: computed from ffmpeg's `speed` instead of `fps` (with `fps≈230` it used to say “1 second” even with 10 minutes left).

## 🆕 What's new in 2.0

| Feature | Details |
|---|---|
| 🎬 **Built-in preview** | Pick a video and the player shows up: play/pause, step **1 frame · 1s · 5s**, thumbnail timeline, **subtitle preview rendered right onto the frame** using **the engine you selected** (AviSynth + `TextSubMod`/`TextSub`, or libass) (.ass/.ssa/.srt, UTF-8 & UTF-16 from Aegisub Windows) — **pause or scrub** and the subtitled frame appears instantly; no WebGL/WASM involved, so **no black screen ever** (failures just hide the subtitle). The **CC button** toggles it instantly. The **external player button** (if VLC/MPV is installed) previews playback via native libass — 100% match with the final render |
| ✂️ **A → B trimming** | Set A/B marks with buttons → render only that range |
| ⬇️ **Export A→B clip** | Export the A→B range alone, **no subtitles**, **original format kept** |
| 🌓 **Fade in / out** | Toggle + **custom duration** (default 100 ms). Automatically applies to the first & last segment of the result, Intro/Outro included |

---

## ✨ Features

| Group | Details |
|---|---|
| **4 drop zones** | Main video ⚠️ · Subtitle `.ass/.srt` ⚠️ · Intro · Outro — shows file name, resolution, FPS, duration, size; Intro/Outro are dimmed until merging is enabled |
| **Subtitle engine** | `VSFilterMod.dll` (default) / `VSFilter.dll` / `libass` — **AviSynth+ is bundled**, no system install needed; the right AviSynth function is picked per build (VSFilterMod → `TextSubMod`, xy-VSFilter → `TextSub`), a failing DLL is swapped for the other one, runtime failures auto-fallback to libass |
| **Hardware encoder** | Auto (prefer GPU) / NVIDIA NVENC / Intel QSV / AMD AMF / CPU x264-x265 — encoders are detected, unavailable ones are dimmed |
| **Quality** | Keep original (Constrained VBR from source) / High / Balanced / Small size / Custom (Resolution · FPS · Bitrate) |
| **Output format** | `MP4` (default) · `MKV` · `MOV` · `WebM` · `AVI` |
| **Intro/Outro merge** | Auto scale + pad to the main video standard, 3-segment concat, silent segments get generated audio |
| **Progress & Log** | Progress % · FPS · speed `×` · **text ETA ("1 h 23 min 45 s")** · stats logged every 5% (frame/fps/bitrate/size) · **Copy whole log** |
| **Language** | **VI / EN switch on the header** — switches the whole UI *and* engine logs instantly, remembers your choice |
| **UI** | Compact single 1600×900 window, no page scrolling, lightweight & fast to open, Error Boundary to prevent blank screens |

---

## 🖱️ How to use

1. **Section 1 · Source Files**: drop the **main video** + **subtitle file**. To merge clips, tick **☑ Merge Intro/Outro** then drop the Intro/Outro files. Enable **Fade in/out** if needed (duration in ms, default 100).
2. **Preview** (right column, appears as soon as a video is picked): play/pause, step 1 frame / 1s / 5s, drag the timeline — **pause and the subtitled frame appears right on screen** (rendered with ffmpeg/libass, identical to the final render) so you can verify the files and timing loaded correctly. To **trim A→B**, set the **A** and **B** marks with the two buttons (taken from the current playback position), or press **Export A→B clip** to export that range alone (no subtitles, original format kept).
3. **Section 2 · Engine & Hardware**: keep the defaults (`VSFilterMod.dll` + `Auto`) if unsure.
4. **Section 3 · Render Quality**: *"Keep original"* produces a file nearly identical to the source — only with the subtitles burned in.
5. **Section 4 · Output & Controls**: pick the output folder, file name (default `<source_name>_exported`), **format** → press **START RENDER**. Watch progress/ETA/logs; when done, press **Open output folder**. To stop, press **CANCEL** (kills the whole FFmpeg process tree).

---

## 📦 Build your own

Requires **Node 18+**, **Rust** (GNU toolchain pinned in `rust-toolchain.toml`) and **WebView2**.

```bash
npm install
npm run check:bin              # verify bin/ (prints download instructions if missing)
npm run build                  # build the React UI → dist/
npm run tauri -- build --no-bundle
                               # → target/release/kull-app-backend.exe  (~98 MB)
```

During compilation `kull-app/src-tauri/build.rs` compresses `bin/` + `WebView2Loader.dll` and embeds them into the exe (208 MB → 76 MB), so **the resulting exe is the whole portable build** — no `bin/` folder needs to ship with it. Rename it however you like.

> Close any running app instance before building/copying the exe.
> Dev mode: `npm run dev`.

### Updating the Release body

```bash
node scripts/setReleaseNotes.js docs/release-notes-v2.1.0.md v2.1.0
```

> ⚠️ **Never write release notes with PowerShell.** PowerShell 5 reads a BOM-less `.ps1` as ANSI (CP1252), so non-ASCII text is already corrupted before it reaches GitHub. The Node script above reads/writes proper UTF-8 and then **re-fetches the release and compares hashes** to prove the body matches the source file.

---

## 🧪 Tests

```bash
cargo test -p kull-engine -- --test-threads=1   # real probe + render + intro/outro merge with bin/ffmpeg.exe
npm run test:i18n                               # bilingual: dictionary parity + VI/EN switch + localStorage
npm run test:arrow-step                         # real bundle (jsdom): ←/→ arrows seek by the chosen step
npm run test:frame-step                         # regression: the "1 frame" button moves exactly one frame
node scripts/checkRows.js                       # section 2 layout structure (buttons grouped per row)
node scripts/checkQuality.js                    # section 3 structure + console log
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
kull-app/
  src/          React UI (App.jsx · i18n.js · components/ · utils/ · renderAPI.ts)
  src-tauri/    Tauri backend (Rust): IPC commands, assets.rs extractor, wv2.rs shim, build.rs asset packer
kull-engine/    Rust render core: probe · subtitle · encoder · render · concat · trim · win (console hiding)
src/            frontend (Vite root)
scripts/        checkBin · checkI18n · checkRows · checkQuality · setReleaseNotes · createRelease
bin/            ffmpeg · ffprobe · AviSynth.dll · VSFilter*.dll · avsplugins/  (build-time only)
```

---

## 📄 License

MIT — see `package.json`.
