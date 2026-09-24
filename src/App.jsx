import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
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
import { basename, dirname, extname, stripExt, withExt, formatDuration, formatBytes } from './utils/format'

const renderAPI = window.renderAPI
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
  const [logs, setLogs] = useState([])
  const [binStatus, setBinStatus] = useState(null)
  const [version, setVersion] = useState('')
  const [resultPath, setResultPath] = useState('')

  const addLogRef = useRef(() => {})
  const addLog = useCallback((text, level = 'info') => {
    setLogs((l) => [...l.slice(-299), { id: ++logId, text, level, time: new Date() }])
  }, [])
  addLogRef.current = addLog

  // ── Khởi tạo: kiểm tra bin, phiên bản, encoder + lắng nghe sự kiện render ──
  useEffect(() => {
    renderAPI.checkBin().then(setBinStatus)
    renderAPI.getAppVersion().then(setVersion)
    renderAPI.getEncoders().then(setAvailableEnc).catch(() => {})

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
            `⚡ ${pct}%`,
            d.frame != null ? `frame=${d.frame}` : null,
            d.fps != null ? `fps=${d.fps.toFixed(1)}` : null,
            d.speed != null ? `${tRef.current('stat.speed')}=${d.speed.toFixed(2)}×` : null,
            d.time ? `time=${d.time}` : null,
            d.bitrate != null ? `bitrate=${Math.round(d.bitrate)}kbps` : null,
            d.sizeKB != null ? `${tRef.current('stat.size')}=${formatBytes(d.sizeKB * 1024)}` : null,
          ].filter(Boolean)
          addLogRef.current(bits.join(' · '))
        }
      }),
      renderAPI.onLog((d) => addLogRef.current(d.line, d.level)),
      renderAPI.onDone((d) => {
        if (d.canceled) {
          setStatus('idle')
          addLogRef.current(tRef.current('msg.canceled'), 'warn')
        } else {
          setStatus('done')
          setProgress((p) => ({ ...p, pct: 100 }))
          setResultPath(d.outputPath)
          addLogRef.current(tRef.current('msg.done'), 'success')
        }
      }),
      renderAPI.onError((d) => {
        setStatus('error')
        addLogRef.current(`❌ ${d.message}`, 'error')
        if (d.detail) addLogRef.current(d.detail, 'error')
      }),
    ]
    return () => offs.forEach((o) => o())
  }, [])

  // ── Quản lý file ──
  const handleFile = useCallback(
    async (slot, p) => {
      if (!p) return
      const name = basename(p)
      setFiles((f) => ({ ...f, [slot]: p }))
      if (slot === 'subtitle') {
        addLogRef.current(tRef.current('msg.pickedSub', { name }))
        return
      }
      addLogRef.current(tRef.current('msg.probing', { name }))
      try {
        const meta = await renderAPI.probeMedia(p, langRef.current)
        setMetas((m) => ({ ...m, [slot]: meta }))
        addLogRef.current(
          tRef.current('msg.probeOk', {
            name,
            res: `${meta.width}×${meta.height}`,
            fps: meta.fps,
            dur: formatDuration(meta.duration),
            br: meta.bitrateAvg,
          })
        )
        if (slot === 'main') {
          setOutputDir(dirname(p))
          // Tên gợi ý bỏ đuôi gốc — đuôi thật do nút Định dạng quyết định
          setOutputName(`${stripExt(name)}_exported`)
        }
      } catch (e) {
        setMetas((m) => ({ ...m, [slot]: null }))
        addLogRef.current(tRef.current('msg.probeFail', { name, msg: e.message }), 'error')
      }
    },
    []
  )

  const handleClear = useCallback((slot) => {
    setFiles((f) => ({ ...f, [slot]: null }))
    setMetas((m) => ({ ...m, [slot]: null }))
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
    setLogs([])
    lastLoggedBucket = -1
    setResultPath('')
    setProgress({ pct: 0, fps: null, speed: null, eta: null })
    setStatus('running')
    try {
      await renderAPI.startRender({
        mainVideo: files.main,
        subtitle: files.subtitle,
        // Gửi rõ cờ ghép để engine không phải suy đoán (engine vẫn chấp nhận chỉ có file)
        mergeEnabled: mergeEnabled,
        intro: mergeEnabled ? files.intro : null,
        outro: mergeEnabled ? files.outro : null,
        subtitleEngine: engine,
        hardware,
        quality,
        custom,
        // Trim A→B do VideoPreview quản lý (qua window.__trimState)
        trim: (window.__trimState && window.__trimState.enabled) ? window.__trimState : { enabled: false },
        // Fade đầu/cuối — UI nhập ms, engine nhận giây (0.05–3s)
        fades: { enabled: fadeEnabled, duration: Math.max(50, Math.min(3000, Number(fadeMs) || 100)) / 1000 },
        // Ngôn ngữ UI → engine ghi log đúng ngôn ngữ đã chọn
        lang,
        // Ép đuôi file xuất theo định dạng đã chọn (mp4/mkv/mov/webm/avi)
        outputPath: withExt(`${outputDir}\\${outputName}`, `.${outputFormat}`),
      })
    } catch (e) {
      setStatus('error')
      addLogRef.current(tRef.current('msg.startFail', { msg: e.message }), 'error')
    }
  }

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
          {[
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
          ))}
        </div>
      </header>

      {/* ── Body fit 1 màn hình: 2 cột scroll nội bộ ── */}
      <main className="flex-1 min-h-0 w-full grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-3 p-3">
        {/* Cột trái: File nguồn (khu 1 + 5) */}
        <div className="min-h-0 overflow-y-auto space-y-3 pr-0.5">
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

          {/* Cột phải: preview + chất lượng + output */}
        <div className="min-h-0 overflow-y-auto space-y-3 pr-0.5 min-w-0">
          {files.main && (
            <VideoPreview
              videoPath={files.main.path}
              subPath={files.subtitle?.path || null}
              subName={files.subtitle ? basename(files.subtitle.path) : ''}
              meta={metas.main}
              status={status}
              outputPath={outputDir && outputName ? `${outputDir}\\${withExt(outputName, outputFormat)}` : ''}
              lang={lang}
              t={t}
            />
          )}
          <div className="rounded-xl border border-slate-800 bg-[#0f1526]/70 p-3">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">{t('sec3.title')}</h2>
            <QualitySelect value={quality} onChange={setQuality} custom={custom} onCustomChange={setCustom} t={t} />
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0f1526]/70 p-3" id="sec4col">
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
            <ProgressPanel status={status} progress={progress} outputPath={resultPath} t={t} />
            {/* Console log nằm gọn dưới mục 4 (trong cột phải) */}
            <div className="mt-2">
              <ConsoleLog logs={logs} embedded lang={lang} t={t} />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}