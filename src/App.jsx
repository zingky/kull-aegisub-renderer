import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react'
import appIcon from './assets/icon.ico'
import DropZone from './components/DropZone'
import EngineSelect from './components/EngineSelect'
import HardwareSelect from './components/HardwareSelect'
import QualitySelect from './components/QualitySelect'
import MergeToggle from './components/MergeToggle'
import FadeToggle from './components/FadeToggle'
import OutputControls from './components/OutputControls'
import ProgressPanel from './components/ProgressPanel'
import ConsoleLog from './components/ConsoleLog'
import VideoPreview from './components/VideoPreview'
import LangSwitch from './components/LangSwitch'
import { useLang } from './i18n'
import { basename, dirname, extname, stripExt, withExt, formatDuration, formatBytes, formatEta } from './utils/format'
import renderAPI, { isElectron } from './renderAPI'

let logId = 0

// Bucket tiến độ lần cuối được ghi ra log (mỗi 5% ghi 1 dòng thống kê)
let lastLoggedBucket = -1

export default function App() {
  // ─ Ngôn ngữ UI (Tiếng Việt / English) ─
  const { lang, setLang, t } = useLang()
  // tRef/langRef: để callback đăng ký 1 lần (useEffect/useCallback deps rỗng) luôn dùng giá trị mới nhất
  const tRef = useRef(t)
  tRef.current = t
  const langRef = useRef(lang)
  langRef.current = lang

  const [files, setFiles] = useState({ main: null, subtitle: null, intro: null, outro: null })
  const [metas, setMetas] = useState({})
  const [engine, setEngine] = useState('vsfiltermod')
  const [hardware, setHardware] = useState('auto')
  const [availableEnc, setAvailableEnc] = useState(['cpu'])
  const [quality, setQuality] = useState('original')
  const [custom, setCustom] = useState({ resolution: '1280x720', fps: '30', bitrate: '2000' })
  const [mergeEnabled, setMergeEnabled] = useState(false)
  const [fadeEnabled, setFadeEnabled] = useState(false)
  const [fadeMs, setFadeMs] = useState(100)
  const [outputDir, setOutputDir] = useState('')
  const [outputName, setOutputName] = useState('')
  const [outputFormat, setOutputFormat] = useState('mp4')
  const [status, setStatus] = useState('idle') // idle | running | done | error
  const [progress, setProgress] = useState({ pct: 0, fps: null, speed: null, eta: null })
  // Thời gian render thực tế (giây) — khác với thời lượng video (duration).
  const [renderElapsed, setRenderElapsed] = useState(null)
  const [logs, setLogs] = useState([])
  const [binStatus, setBinStatus] = useState(null)
  // Lần chạy đầu của bản 1 file exe: đang giải nén ffmpeg/ffprobe
  const [binPreparing, setBinPreparing] = useState(true)
  const [version, setVersion] = useState('')
  const [resultPath, setResultPath] = useState('')

  const addLogRef = useRef(() => {})
  const addLog = useCallback((text, level = 'info') => {
    setLogs((l) => [...l.slice(-299), { id: ++logId, text, level, time: new Date() }])
  }, [])
  addLogRef.current = addLog

  // ── Canh chiều cao cửa sổ theo chiều cao THẬT của Cột 1 ──
  // col1Ref = khung cuộn của cột 1 · col1InnerRef = nội dung thật (đo chiều cao tự nhiên)
  const col1Ref = useRef(null)
  const col1InnerRef = useRef(null)
  const lastFitRef = useRef(0)

  /** Đo chiều cao nội dung Cột 1 → xin Main Process nới/thu chiều cao cửa sổ cho VỪA KHÍT. */
  const fitWindowToCol1 = useCallback(() => {
    const box = col1Ref.current
    const inner = col1InnerRef.current
    if (!box || !inner || typeof renderAPI?.fitWindowHeight !== 'function') return
    const delta = Math.ceil(inner.getBoundingClientRect().height) - box.clientHeight
    // delta > 0: nội dung cao hơn khung nhìn → cửa sổ phải cao thêm
    // delta < 0: khung nhìn còn dư chỗ → thu cửa sổ lại cho vừa khít
    if (!delta || Math.abs(delta - lastFitRef.current) < 2) return
    lastFitRef.current = delta
    renderAPI.fitWindowHeight(delta).catch(() => {})
  }, [])

  // ── Khởi tạo: kiểm tra bin, phiên bản, encoder + lắng nghe sự kiện render ──
  useEffect(() => {
    // init() có thể mất vài giây ở lần chạy đầu (giải nén ffmpeg) → mọi thứ phụ
    // thuộc engine phải chờ init xong, nếu không detect encoder sẽ chạy khi engine chưa có.
    renderAPI
      .init()
      .then(() => {
        renderAPI.checkBin().then(setBinStatus).catch((e) => addLogRef.current(`❌ ${e}`, 'error'))
        renderAPI.getEncoders().then(setAvailableEnc).catch(() => {})
      })
      .catch((e) => addLogRef.current(`❌ Không khởi tạo được engine: ${e}`, 'error'))
      .finally(() => setBinPreparing(false))
    renderAPI.getAppVersion().then(setVersion)

    const offs = [
      renderAPI.onProgress((d) => {
        setProgress((p) => ({
          pct: d.progress ?? p.pct,
          fps: d.fps ?? p.fps,
          speed: d.speed ?? p.speed,
          eta: d.eta ?? p.eta,
        }))
        // Log thống kê chi tiết mỗi 5% tiến độ (frame/fps/tốc độ/time/bitrate/dung lượng)
        const pct = d.progress ?? 0
        const bucket = Math.floor(pct / 5)
        if (bucket > lastLoggedBucket && (d.frame != null || d.fps != null)) {
          lastLoggedBucket = bucket
          const bits = [
            `⚡ ${pct.toFixed(1)}%`,
            d.frame != null ? `frame=${d.frame}` : null,
            d.fps != null ? `fps=${d.fps.toFixed(1)}` : null,
            d.speed != null ? `${tRef.current('stat.speed')}=${d.speed.toFixed(2)}×` : null,
            d.eta != null ? `${tRef.current('pg.eta')} ${formatEta(d.eta, tRef.current)}` : null,
            d.time ? `time=${d.time}` : null,
            d.bitrate != null ? `bitrate=${Math.round(d.bitrate)}kbps` : null,
            d.sizeKB != null ? `${tRef.current('stat.size')}=${formatBytes(d.sizeKB * 1024)}` : null,
          ].filter(Boolean)
          addLogRef.current(bits.join(' · '))
        }
      }),
      renderAPI.onLog((d) => addLogRef.current(d.line, d.level)),
      // Xuất clip A→B: log vào Console Log (kênh riêng, không đổi trạng thái render)
      renderAPI.onTrimEvent((e) => {
        if (e.type === 'log') {
          addLogRef.current(e.data.line, e.data.level)
        } else if (e.type === 'error') {
          addLogRef.current(`❌ ${e.data.message}`, 'error')
          if (e.data.detail) addLogRef.current(e.data.detail, 'error')
        }
      }),
      renderAPI.onDone((d) => {
        if (d.canceled) {
          setStatus('idle')
          addLogRef.current(tRef.current('msg.canceled'), 'warn')
        } else {
          setStatus('done')
          setProgress((p) => ({ ...p, pct: 100 }))
          setResultPath(d.outputPath)
          // Thời gian render THỰC (wall-clock) từ main → hiện ở panel kết quả.
          setRenderElapsed(d.elapsed ?? null)
          addLogRef.current(tRef.current('msg.done'), 'success')
        }
      }),
      renderAPI.onError((d) => {
        setStatus('error')
        addLogRef.current(`❌ ${d.message}`, 'error')
        if (d.detail) addLogRef.current(d.detail, 'error')
      }),
    ]

    // Nếu không đăng ký được listener (thiếu quyền Tauri) → báo ngay trong Console Log
    const onListenerError = (e) => {
      const d = e?.detail || {}
      addLogRef.current(`❌ Không nghe được sự kiện "${d.channel}": ${d.error}`, 'error')
    }
    window.addEventListener('kull:listener-error', onListenerError)

    return () => {
      offs.forEach((o) => o())
      window.removeEventListener('kull:listener-error', onListenerError)
    }
  }, [])

  // ── Canh chiều cao cửa sổ cho vừa khít Cột 1 ──
  //  · chạy 1 lần khi mở app (và mỗi khi nội dung Cột 1 đổi: bật Merge/Fade, thêm file, đổi ngôn ngữ…)
  //  · khi cửa sổ bị kéo giãn BỀ NGANG thì canh lại (chữ xuống dòng → chiều cao Cột 1 đổi);
  //    còn nếu chỉ người dùng tự kéo cao/thấp thì giữ nguyên, không giật về.
  useEffect(() => {
    const box = col1Ref.current
    const inner = col1InnerRef.current
    if (!box || !inner) return
    let timer = 0
    const schedule = () => { clearTimeout(timer); timer = setTimeout(fitWindowToCol1, 120) }
    let lastW = window.innerWidth
    const onResize = () => {
      if (Math.abs(window.innerWidth - lastW) < 1) return
      lastW = window.innerWidth
      schedule()
    }
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null
    if (ro) ro.observe(inner)
    window.addEventListener('resize', onResize)
    schedule()
    return () => {
      clearTimeout(timer)
      if (ro) ro.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [fitWindowToCol1])

  // ── Quản lý file ──
  const handleFile = useCallback(
    async (slot, p) => {
      if (!p) return
      const name = basename(p)
      setFiles((f) => ({ ...f, [slot]: p }))
      if (slot === 'subtitle') {
        addLogRef.current(tRef.current('msg.pickedSub', { name }))
        // Đọc chi tiết file phụ đề: format, encoding, số dòng thoại, style, font…
        try {
          const info = await renderAPI.subtitleInfo(p)
          setMetas((m) => ({ ...m, [slot]: info }))
          addLogRef.current(
            tRef.current('msg.subInfo', {
              name,
              fmt: info.format,
              enc: info.encoding,
              res: info.playResX ? `${info.playResX}×${info.playResY}` : '—',
              dlg: info.dialogues,
              styles: (info.styles || []).length,
              fonts: (info.fonts || []).slice(0, 4).join(', ') || '—',
              first: formatDuration(info.firstSec),
              last: formatDuration(info.lastSec),
              size: formatBytes(info.sizeBytes),
              path: p,
            })
          )
        } catch (e) {
          setMetas((m) => ({ ...m, [slot]: null }))
          const errMsg = typeof e === 'string' ? e : (e?.message ?? String(e))
          addLogRef.current(tRef.current('msg.subInfoFail', { name, msg: errMsg }), 'error')
        }
        return
      }
      addLogRef.current(tRef.current('msg.probing', { name }))
      // Luôn gán thư mục xuất + tên gợi ý ngay khi chọn video chính,
      // KHÔNG chờ probeMedia thành công (probe có thể lỗi codec nhưng output vẫn cần điền sẵn)
      if (slot === 'main') {
        setOutputDir(dirname(p))
        setOutputName(`${stripExt(name)}_exported`)
      }
      try {
        const meta = await renderAPI.probeMedia(p, langRef.current)
        setMetas((m) => ({ ...m, [slot]: meta }))
        const acodec = meta.hasAudio
          ? `${(meta.audioCodec || '?').toUpperCase()} ${meta.sampleRate || ''}Hz ${meta.channels || 2}ch`
          : tRef.current('msg.noAudio')
        addLogRef.current(
          tRef.current('msg.videoInfo', {
            name,
            res: `${meta.width}×${meta.height}`,
            fps: meta.fps,
            dur: formatDuration(meta.duration),
            vcodec: (meta.videoCodec || '?').toUpperCase(),
            acodec,
            br: meta.bitrateAvg,
            size: formatBytes(meta.sizeBytes),
            path: p,
          })
        )
      } catch (e) {
        setMetas((m) => ({ ...m, [slot]: null }))
        const errMsg = typeof e === 'string' ? e : (e?.message ?? String(e))
        addLogRef.current(tRef.current('msg.probeFail', { name, msg: errMsg }), 'error')
      }
    },
    []
  )

  const handleClear = useCallback((slot) => {
    setFiles((f) => ({ ...f, [slot]: null }))
    setMetas((m) => ({ ...m, [slot]: null }))
  }, [])

  // Tham chiếu mới nhất của handleFile cho listener native (kéo–thả file)
  const handleFileRef = useRef(handleFile)
  handleFileRef.current = handleFile

  // ── Kéo–thả file trên Windows ──
  // Tauri bắt sự kiện drag-drop ở tầng native (webview Windows không phát DOM drop),
  // nên phải nghe tauri://drag-drop rồi tự xác định ô nào dưới con trỏ.
  useEffect(() => {
    if (isElectron) return undefined
    let unlisten = null
    let disposed = false
    import('@tauri-apps/api/webview')
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent((event) => {
          const p = event && event.payload
          if (!p || p.type !== 'drop') return
          const paths = Array.isArray(p.paths) ? p.paths : []
          if (!paths.length) return
          const path = paths[0]
          let slot = null
          if (p.position) {
            const dpr = window.devicePixelRatio || 1
            const el = document.elementFromPoint(p.position.x / dpr, p.position.y / dpr)
            const zone = el && el.closest ? el.closest('[data-dropzone-slot]') : null
            if (zone) slot = zone.getAttribute('data-dropzone-slot')
          }
          if (!slot) slot = /\.(ass|ssa|srt|txt)$/i.test(path) ? 'subtitle' : 'main'
          handleFileRef.current(slot, path)
        })
      )
      .then((fn) => {
        if (disposed) fn()
        else unlisten = fn
      })
      .catch(() => {})
    return () => {
      disposed = true
      if (unlisten) unlisten()
    }
  }, [])

  const openFolder = async () => {
    if (!outputDir) return
    const err = await renderAPI.openFolder(outputDir)
    if (err) addLogRef.current(tRef.current('msg.openFolderFail', { msg: err }), 'error')
  }

  // ── Render ──
  const validate = () => {
    if (!files.main) {
      addLogRef.current(tRef.current('msg.needMain'), 'warn')
      return false
    }
    if (!files.subtitle) {
      addLogRef.current(tRef.current('msg.needSub'), 'warn')
      return false
    }
    if (!outputDir || !outputName) {
      addLogRef.current(tRef.current('msg.needOutput'), 'warn')
      return false
    }
    if (mergeEnabled && !files.intro && !files.outro) {
      addLogRef.current(tRef.current('msg.needIntroOutro'), 'warn')
      return false
    }
    return true
  }

  const handleStart = async () => {
    if (status === 'running') return
    if (!validate()) return
    // KHÔNG xóa log cũ: giữ thông tin video/phụ đề đã chọn, log render nối tiếp bên dưới
    lastLoggedBucket = -1
    setResultPath('')
    setProgress({ pct: 0, fps: null, speed: null, eta: null })
    setRenderElapsed(null)
    setStatus('running')
    try {
      await renderAPI.startRender({
        mainVideo: files.main,
        subtitle: files.subtitle,
        intro: mergeEnabled ? files.intro : null,
        outro: mergeEnabled ? files.outro : null,
        engine,
        hardware,
        quality,
        custom,
        mergeEnabled,
        fadeEnabled,
        fadeMs: Math.max(50, Math.min(3000, Number(fadeMs) || 100)),
        lang,
        outputDir,
        outputName,
        outputFormat,
        trim: { enabled: false, start: 0, end: 0 },
      })
    } catch (e) {
      setStatus('error')
      const errMsg = typeof e === 'string' ? e : (e?.message ?? String(e))
      addLogRef.current(tRef.current('msg.startFail', { msg: errMsg }), 'error')
    }
  }

  // ── Dev-only: nạp cặp video/phụ đề test qua sự kiện tùy chỉnh (QA tự động qua CDP) ──
  // Không chạy trong bản build thường (import.meta.env.DEV = false → bị loại bỏ).
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined
    const onLoad = (e) => {
      const d = e.detail || {}
      if (d.video) handleFile('main', d.video)
      if (d.sub) handleFile('subtitle', d.sub)
    }
    window.addEventListener('kull-test-load', onLoad)
    return () => window.removeEventListener('kull-test-load', onLoad)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#0b0f19]">
      {/* ── Header gọn 1 dòng ── */}
      <header className="shrink-0 z-20 bg-[#0f1526]/95 backdrop-blur border-b border-slate-800 px-4 py-2 flex items-center gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <img src={appIcon} alt="logo" className="shrink-0 w-7 h-7" />
          <h1 className="text-[13px] font-extrabold tracking-tight text-white leading-none truncate">
            {t('app.name')}
            <span className="ml-2 font-normal text-slate-500">
              {t('app.tagline')}
              {version ? ` · v${version}` : ''}
            </span>
          </h1>
        </div>

        <LangSwitch lang={lang} onChange={setLang} label={t('lang.label')} />

        <div className="hidden xl:flex items-center gap-1.5 text-[10px] font-medium shrink-0">
          <span className="text-slate-500 mr-1">bin/</span>
          {binPreparing ? (
            <span className="px-1.5 py-0.5 rounded-full border border-sky-500/40 bg-sky-500/10 text-sky-300 inline-flex items-center gap-1">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              {t('bin.preparing')}
            </span>
          ) : (
            [
              ['ffmpeg', binStatus?.ffmpeg],
              ['ffprobe', binStatus?.ffprobe],
              ['AviSynth', binStatus?.avisynth],
              ['VSFilterMod', binStatus?.vsfiltermod],
              ['VSFilter', binStatus?.vsfilter],
            ].map(([label, ok]) => (
              <span
                key={label}
                title={`bin/${label} ${ok ? t('bin.ready') : t('bin.missing')}`}
                className={clsx(
                  'px-1.5 py-0.5 rounded-full border inline-flex items-center gap-1',
                  ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-red-500/50 bg-red-500/10 text-red-300'
                )}
              >
                {ok ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                {label}
              </span>
            ))
          )}
        </div>
      </header>

      {/* ── Body fit 1 màn hình: 3 cột ── */}
      <main className="flex-1 min-h-0 w-full grid grid-cols-1 lg:grid-cols-[330px_minmax(360px,420px)_1fr] gap-3 p-3">
        {/* Cột 1: File nguồn (khu 1) & Cấu hình render (khu 2)
            → col1Ref = khung cuộn, col1InnerRef = nội dung THẬT của cột
              (đo chiều cao tự nhiên để canh chiều cao cửa sổ cho vừa khít) */}
        <div ref={col1Ref} className="min-h-0 overflow-y-auto pr-0.5">
          <div ref={col1InnerRef} className="space-y-3">
          <div className="rounded-xl border border-slate-800 bg-[#0f1526]/70 p-3 space-y-2">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 flex items-center justify-between">
              <span>{t('sec1.title')}</span>
              <span className="text-[10px] text-slate-600 normal-case">{t('sec1.hint')}</span>
            </h2>
            <DropZone slot="main" file={files.main} meta={metas.main} required t={t} onFile={(p) => handleFile('main', p)} onClear={() => handleClear('main')} />
            <DropZone slot="subtitle" file={files.subtitle} meta={metas.subtitle} required t={t} onFile={(p) => handleFile('subtitle', p)} onClear={() => handleClear('subtitle')} />
            <div className="flex items-center gap-1.5 text-[10px] text-slate-600 px-0.5">
              <span className="flex-1 border-t border-dashed border-slate-700/60" />
              <span className="shrink-0">{t('sec1.mergeDivider')}</span>
              <span className="flex-1 border-t border-dashed border-slate-700/60" />
            </div>
            <MergeToggle checked={mergeEnabled} onChange={setMergeEnabled} t={t} />
            <DropZone slot="intro" file={files.intro} meta={metas.intro} disabled={!mergeEnabled} t={t} onFile={(p) => handleFile('intro', p)} onClear={() => handleClear('intro')} />
            <DropZone slot="outro" file={files.outro} meta={metas.outro} disabled={!mergeEnabled} t={t} onFile={(p) => handleFile('outro', p)} onClear={() => handleClear('outro')} />
            <FadeToggle checked={fadeEnabled} onChange={setFadeEnabled} ms={fadeMs} onMsChange={setFadeMs} t={t} />
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0f1526]/70 p-3" id="sec2">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">{t('sec2.title')}</h2>
            <EngineSelect value={engine} onChange={setEngine} t={t} />
            <HardwareSelect value={hardware} onChange={setHardware} available={availableEnc} t={t} />
          </div>

          {binStatus && !binStatus.ffmpeg && !binStatus.ffprobe && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] text-amber-200 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {t('bin.warn1')} <code>`npm run check:bin`</code> {t('bin.warn2')}
              </span>
            </div>
          )}
          </div>
        </div>

        {/* Cột 2: Mục 3 (Chất lượng) + Mục 4 (Xuất file) + Console log */}
        <div className="min-h-0 flex flex-col gap-2.5 overflow-hidden">
          <div className="shrink-0 rounded-xl border border-slate-800 bg-[#0f1526]/70 p-2.5">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">{t('sec3.title')}</h2>
            <QualitySelect value={quality} onChange={setQuality} custom={custom} onCustomChange={setCustom} t={t} />
          </div>

          <div className="min-h-0 flex-1 rounded-xl border border-slate-800 bg-[#0f1526]/70 p-2.5 flex flex-col" id="sec4col">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">{t('sec4.title')}</h2>
            <OutputControls
              outputDir={outputDir}
              setOutputDir={setOutputDir}
              outputName={outputName}
              setOutputName={setOutputName}
              outputFormat={outputFormat}
              setOutputFormat={setOutputFormat}
              status={status}
              onStart={handleStart}
              onCancel={() => renderAPI.cancelRender()}
              onOpenFolder={openFolder}
              lang={lang}
              t={t}
            />
            <ProgressPanel status={status} progress={progress} outputPath={resultPath} elapsed={renderElapsed} t={t} />
            {/* Console log: giãn HẾT chiều cao còn lại của Cột 2 (bằng chiều cao Cột 1) */}
            <div className="mt-2 pt-2 flex-1 min-h-[120px] flex flex-col">
              <ConsoleLog logs={logs} embedded lang={lang} t={t} />
            </div>
          </div>
        </div>

        {/* Cột 3: Toàn bộ Xem trước & Cắt đoạn (A→B) nằm gọn trong cột thứ 3 */}
        <div className="min-h-0 flex flex-col min-w-0">
          <VideoPreview
            videoPath={files.main || null}
            subPath={files.subtitle || null}
            subName={files.subtitle ? basename(files.subtitle) : ''}
            meta={metas.main}
            status={status}
            engine={engine}
            outputPath={outputDir && outputName ? `${outputDir}\\${withExt(outputName, outputFormat)}` : ''}
            outputFormat={outputFormat}
            lang={lang}
            t={t}
          />
        </div>
      </main>
    </div>
  )
}