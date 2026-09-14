import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Clapperboard, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import DropZone from './components/DropZone'
import EngineSelect from './components/EngineSelect'
import HardwareSelect from './components/HardwareSelect'
import QualitySelect from './components/QualitySelect'
import MergeToggle from './components/MergeToggle'
import OutputControls from './components/OutputControls'
import ProgressPanel from './components/ProgressPanel'
import ConsoleLog from './components/ConsoleLog'
import { basename, dirname, extname, stripExt, formatDuration } from './utils/format'

const renderAPI = window.renderAPI
let logId = 0

export default function App() {
  const [files, setFiles] = useState({ main: null, subtitle: null, intro: null, outro: null })
  const [metas, setMetas] = useState({})
  const [engine, setEngine] = useState('vsfiltermod')
  const [hardware, setHardware] = useState('auto')
  const [availableEnc, setAvailableEnc] = useState(['cpu'])
  const [quality, setQuality] = useState('original')
  const [custom, setCustom] = useState({ resolution: '1280x720', fps: '30', bitrate: '2000' })
  const [mergeEnabled, setMergeEnabled] = useState(false)
  const [outputDir, setOutputDir] = useState('')
  const [outputName, setOutputName] = useState('')
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
      renderAPI.onProgress((d) =>
        setProgress((p) => ({
          pct: d.progress ?? p.pct,
          fps: d.fps ?? p.fps,
          speed: d.speed ?? p.speed,
          eta: d.eta ?? p.eta,
        }))
      ),
      renderAPI.onLog((d) => addLogRef.current(d.line, d.level)),
      renderAPI.onDone((d) => {
        if (d.canceled) {
          setStatus('idle')
          addLogRef.current('Render đã bị hủy bởi người dùng.', 'warn')
        } else {
          setStatus('done')
          setProgress((p) => ({ ...p, pct: 100 }))
          setResultPath(d.outputPath)
          addLogRef.current('🎬 Render hoàn tất 100% — file đã sẵn sàng!', 'success')
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
        addLogRef.current(`📝 Đã chọn subtitle: ${name}`)
        return
      }
      addLogRef.current(`🔍 Đang phân tích: ${name}…`)
      try {
        const meta = await renderAPI.probeMedia(p)
        setMetas((m) => ({ ...m, [slot]: meta }))
        addLogRef.current(
          `✓ ${name}: ${meta.width}×${meta.height} @ ${meta.fps}fps · ${formatDuration(meta.duration)} · bitrate ~${meta.bitrateAvg}kbps`
        )
        if (slot === 'main') {
          setOutputDir(dirname(p))
          const ext = extname(p) || 'mp4'
          setOutputName(`${stripExt(name)}_exported.${ext}`)
        }
      } catch (e) {
        setMetas((m) => ({ ...m, [slot]: null }))
        addLogRef.current(`✗ Không đọc được ${name}: ${e.message}`, 'error')
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
    if (err) addLogRef.current(`Không mở được thư mục: ${err}`, 'error')
  }

  // ── Render ──
  const validate = () => {
    if (!files.main) {
      addLogRef.current('⚠ Vui lòng chọn File Video chính.', 'warn')
      return false
    }
    if (!files.subtitle) {
      addLogRef.current('⚠ Vui lòng chọn File Subtitle.', 'warn')
      return false
    }
    if (!outputDir || !outputName) {
      addLogRef.current('⚠ Thiếu thư mục hoặc tên file xuất.', 'warn')
      return false
    }
    if (mergeEnabled && !files.intro && !files.outro) {
      addLogRef.current('⚠ Đã bật ghép Intro/Outro nhưng chưa chọn ít nhất 1 file Intro hoặc Outro.', 'warn')
      return false
    }
    return true
  }

  const handleStart = async () => {
    if (status === 'running') return
    if (!validate()) return
    setLogs([])
    setResultPath('')
    setProgress({ pct: 0, fps: null, speed: null, eta: null })
    setStatus('running')
    try {
      await renderAPI.startRender({
        mainVideo: files.main,
        subtitle: files.subtitle,
        intro: mergeEnabled ? files.intro : null,
        outro: mergeEnabled ? files.outro : null,
        subtitleEngine: engine,
        hardware,
        quality,
        custom,
        outputPath: `${outputDir}\\${outputName}`,
      })
    } catch (e) {
      setStatus('error')
      addLogRef.current(`Không khởi động được render: ${e.message}`, 'error')
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f19]">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-[#0f1526]/95 backdrop-blur border-b border-slate-800 px-5 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-900/40">
            <Clapperboard className="w-5 h-5 text-slate-950" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold tracking-tight text-white leading-tight">Kull Vietsub Renderer</h1>
            <p className="text-[11px] text-slate-400 truncate">
              Hardsub ASS/SRT bằng FFmpeg + VSFilter · {version ? `v${version}` : ''}
            </p>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-2 text-[11px] font-medium">
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
              title={`bin/${label} ${ok ? 'đã sẵn sàng' : 'THIẾU — chạy npm run check:bin'}`}
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

      {/* ── Body ── */}
      <main className="flex-1 w-full max-w-[1500px] mx-auto grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-4 p-4">
        {/* Cột trái: File nguồn (khu 1 + 5) */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-[#0f1526]/70 p-4 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center justify-between">
              <span>1 · File Nguồn</span>
              <span className="text-[10px] text-slate-600 normal-case">4 ô kéo thả</span>
            </h2>
            <DropZone slot="main" file={files.main} meta={metas.main} required onFile={(p) => handleFile('main', p)} onClear={() => handleClear('main')} />
            <DropZone slot="subtitle" file={files.subtitle} meta={metas.subtitle} required onFile={(p) => handleFile('subtitle', p)} onClear={() => handleClear('subtitle')} />
            <DropZone slot="intro" file={files.intro} meta={metas.intro} disabled={!mergeEnabled} onFile={(p) => handleFile('intro', p)} onClear={() => handleClear('intro')} />
            <DropZone slot="outro" file={files.outro} meta={metas.outro} disabled={!mergeEnabled} onFile={(p) => handleFile('outro', p)} onClear={() => handleClear('outro')} />
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0f1526]/70 p-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">5 · Tùy Chọn Ghép Video</h2>
            <MergeToggle checked={mergeEnabled} onChange={setMergeEnabled} />
          </div>

          {binStatus && !binStatus.ffmpeg && !binStatus.ffprobe && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-[12px] text-amber-200 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Thiếu <b>bin/ffmpeg.exe / ffprobe.exe</b>! Chạy <code>`npm run check:bin`</code> để xem hướng dẫn tải bản
                portable.
              </span>
            </div>
          )}
        </div>

        {/* Cột phải: cài đặt + điều khiển */}
        <div className="space-y-4 min-w-0">
          <div className="rounded-xl border border-slate-800 bg-[#0f1526]/70 p-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">2 · Engine Subtitle &amp; Phần Cứng</h2>
            <EngineSelect value={engine} onChange={setEngine} />
            <HardwareSelect value={hardware} onChange={setHardware} available={availableEnc} />
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0f1526]/70 p-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">3 · Chất Lượng Render</h2>
            <QualitySelect value={quality} onChange={setQuality} custom={custom} onCustomChange={setCustom} />
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0f1526]/70 p-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">4 · Output &amp; Điều Khiển</h2>
            <OutputControls
              outputDir={outputDir}
              setOutputDir={setOutputDir}
              outputName={outputName}
              setOutputName={setOutputName}
              status={status}
              onStart={handleStart}
              onCancel={() => renderAPI.cancelRender()}
              onOpenFolder={openFolder}
            />
            <ProgressPanel status={status} progress={progress} outputPath={resultPath} />
          </div>
        </div>
      </main>

      {/* ── Console Log ── */}
      <ConsoleLog logs={logs} />
    </div>
  )
}