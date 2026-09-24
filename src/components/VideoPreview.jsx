import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  Play, Pause, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight,
  SkipBack, SkipForward, Download,
} from 'lucide-react'

/**
 * VideoPreview — Khung preview hardsub + Trim A→B (v2.0)
 * JASSUB lazy-load → không ảnh hưởng tốc độ mở app.
 */
export default function VideoPreview({ videoPath, subPath, subName, meta, status, outputPath, lang, t }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const jassubRef = useRef(null)
  const timelineRef = useRef(null)
  const thumbsDirRef = useRef(null)

  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [duration, setDuration] = useState(meta?.duration || 0)
  const [fps, setFps] = useState(meta?.fps || 24)
  const [trim, setTrim] = useState({ start: 0, end: meta?.duration || 0 })
  const [thumbs, setThumbs] = useState([])
  const [jassubState, setJassubState] = useState('off')
  const [videoError, setVideoError] = useState(false)

  const fmt = (s) => {
    if (!isFinite(s) || s < 0) s = 0
    const m = Math.floor(s / 60), sec = Math.floor(s % 60), d = Math.floor((s % 1) * 10)
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${d}`
  }

  // Reset khi đổi video
  useEffect(() => {
    setTrim({ start: 0, end: meta?.duration || 0 })
    setDuration(meta?.duration || 0)
    setFps(meta?.fps || 24)
    setCur(0)
    setVideoError(false)
  }, [videoPath, meta?.duration, meta?.fps])

  // Thumbnail timeline
  useEffect(() => {
    let canceled = false
    if (!videoPath || !window.renderAPI?.extractThumbs) return
    if (thumbsDirRef.current) window.renderAPI.cleanupThumbs(thumbsDirRef.current)
    thumbsDirRef.current = null
    setThumbs([])
    window.renderAPI.extractThumbs(videoPath).then((res) => {
      if (canceled || !res?.thumbs?.length) return
      thumbsDirRef.current = res.dir
      setThumbs(res.thumbs.map((x) => ({ t: x.t, url: `file:///${String(x.file).replace(/\\/g, '/')}` })))
    }).catch(() => {})
    return () => { canceled = true }
  }, [videoPath])

  // dọn thumbnail khi unmount
  useEffect(() => () => {
    if (thumbsDirRef.current && window.renderAPI?.cleanupThumbs) window.renderAPI.cleanupThumbs(thumbsDirRef.current)
  }, [])

  // JASSUB phụ đề live (lazy import)
  useEffect(() => {
    let canceled = false
    if (!videoPath || !subPath || !/\.ass$/i.test(subPath || '')) { setJassubState('off'); return }
    setJassubState('loading')
    Promise.all([import('jassub'), window.renderAPI.readFileText(subPath)]).then(([mod, content]) => {
      if (canceled || !content) return
      try { jassubRef.current?.destroy?.() } catch (e) {}
      jassubRef.current = new mod.default({ video: videoRef.current, canvas: canvasRef.current, subContent: content })
      setJassubState('ok')
    }).catch(() => { if (!canceled) setJassubState('fail') })
    return () => {
      canceled = true
      try { jassubRef.current?.destroy?.() } catch (e) {}
      jassubRef.current = null
    }
  }, [videoPath, subPath])

  // Player events + pause khi render
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onT = () => setCur(v.currentTime)
    const onP = () => setPlaying(true)
    const onPa = () => setPlaying(false)
    const onM = () => { if (isFinite(v.duration) && v.duration > 0) setDuration(v.duration) }
    v.addEventListener('timeupdate', onT)
    v.addEventListener('play', onP)
    v.addEventListener('pause', onPa)
    v.addEventListener('loadedmetadata', onM)
    return () => {
      v.removeEventListener('timeupdate', onT)
      v.removeEventListener('play', onP)
      v.removeEventListener('pause', onPa)
      v.removeEventListener('loadedmetadata', onM)
    }
  }, [videoPath])

  useEffect(() => {
    if (status === 'running' && videoRef.current && !videoRef.current.paused) videoRef.current.pause()
  }, [status])

  const seek = (s) => {
    const v = videoRef.current
    if (!v) return
    const d = duration || v.duration || 0
    v.currentTime = Math.max(0, Math.min(d, s))
    setCur(v.currentTime)
  }
  const step = (delta) => seek((videoRef.current?.currentTime || 0) + delta)
  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play().catch(() => {}); else v.pause()
  }

  // Keyboard: Space play/pause, ←/→ ±1s, Shift+←/→ ±5s
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return
      if (e.code === 'Space') { e.preventDefault(); togglePlay() }
      else if (e.code === 'ArrowLeft') step(e.shiftKey ? -5 : -1)
      else if (e.code === 'ArrowRight') step(e.shiftKey ? 5 : 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [duration])

  // Timeline: click seek + kéo marker A/B
  const timeFromEvent = (e) => {
    const rect = timelineRef.current?.getBoundingClientRect()
    if (!rect || !duration) return 0
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration
  }
  const onTimelineDown = (which) => (e) => {
    e.preventDefault(); e.stopPropagation()
    const move = (ev) => {
      const tval = timeFromEvent(ev)
      setTrim((p) => (which === 'a'
        ? { ...p, start: Math.min(tval, p.end - 0.1) }
        : { ...p, end: Math.max(tval, p.start + 0.1) }))
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  const onTimelineClick = (e) => seek(timeFromEvent(e))

  // Export clip A→B (giữ định dạng gốc)
  const exportClip = () => {
    if (!window.renderAPI?.startTrim) return
    const out = String(outputPath || '').replace(/\.[^.]+$/, '') || 'clip'
    const srcExt = (String(videoPath).match(/\.([^.\\/:*?"<>|]+)$/) || [])[1] || 'mp4'
    window.renderAPI.startTrim({
      mainVideo: videoPath,
      outputPath: `${out}_trim.${srcExt.toLowerCase()}`,
      trim: { start: trim.start, end: trim.end },
      lang,
    })
  }

  const inTrim = cur >= trim.start && cur <= trim.end
  const pct = (s) => (duration > 0 ? (s / duration) * 100 : 0)

  // Đồng bộ state trim ra toàn cục (App.jsx đọc khi bấm BẮT ĐẦU RENDER)
  const trimActive = trim.start > 0.05 || (duration > 0 && trim.end < duration - 0.05)
  useEffect(() => {
    window.__trimState = { enabled: trimActive, start: trim.start, end: trim.end }
  }, [trimActive, trim.start, trim.end])

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0f1526]/70 p-3 space-y-2">
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
        {t('pv.title')}
        {jassubState === 'ok' && <span className="ml-2 normal-case text-[10px] text-emerald-400">ASS live ✓</span>}
        {jassubState === 'fail' && <span className="ml-2 normal-case text-[10px] text-amber-400">{t('pv.assFail')}</span>}
      </h2>

      <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9', maxHeight: 320 }}>
        <video
          ref={videoRef}
          src={videoPath ? `file:///${String(videoPath).replace(/\\/g, '/')}` : undefined}
          className="w-full h-full object-contain"
          onError={() => setVideoError(true)}
          onClick={togglePlay}
        />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
        {videoError && (
          <div className="absolute inset-0 flex items-center justify-center text-center text-[11px] text-amber-300 bg-black/70 p-4">
            {t('pv.codecFail')}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 flex-wrap text-slate-300">
        <Btn onClick={() => seek(0)} title={t('pv.toStart')}><SkipBack className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => step(-5)} title="-5s"><ChevronsLeft className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => step(-1)} title="-1s"><ChevronLeft className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => step(-1 / fps)} title="-1 frame"><span className="text-[10px] font-bold">◀|</span></Btn>
        <Btn onClick={togglePlay} title="Play/Pause (Space)" primary>
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Btn>
        <Btn onClick={() => step(1 / fps)} title="+1 frame"><span className="text-[10px] font-bold">|▶</span></Btn>
        <Btn onClick={() => step(1)} title="+1s"><ChevronRight className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => step(5)} title="+5s"><ChevronsRight className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => seek(duration)} title={t('pv.toEnd')}><SkipForward className="w-3.5 h-3.5" /></Btn>
        <span className="ml-auto text-[11px] font-mono">
          <span className={inTrim ? 'text-emerald-400' : 'text-slate-500'}>{fmt(cur)}</span>
          <span className="text-slate-600"> / {fmt(duration)}</span>
        </span>
      </div>

      <div
        ref={timelineRef}
        className="relative h-9 rounded select-none cursor-pointer bg-slate-900 border border-slate-800 overflow-hidden"
        onMouseDown={onTimelineClick}
      >
        <div className="absolute inset-0 flex opacity-70 pointer-events-none">
          {thumbs.map((x, i) => (
            <img key={i} src={x.url} alt="" className="h-full object-cover flex-1 min-w-0" draggable="false" />
          ))}
        </div>
        <div
          className="absolute top-0 bottom-0 bg-emerald-400/20 border-x-2 border-emerald-400 pointer-events-none"
          style={{ left: `${pct(trim.start)}%`, width: `${pct(trim.end) - pct(trim.start)}%` }}
        />
        <div className="absolute top-0 bottom-0 w-2 -ml-1 bg-amber-400 rounded cursor-ew-resize" style={{ left: `${pct(trim.start)}%` }} onMouseDown={onTimelineDown('a')} title="A" />
        <div className="absolute top-0 bottom-0 w-2 -ml-1 bg-sky-400 rounded cursor-ew-resize" style={{ left: `${pct(trim.end)}%` }} onMouseDown={onTimelineDown('b')} title="B" />
      </div>

      <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
        <button
          onClick={() => setTrim((p) => ({ ...p, start: Math.min(cur, p.end - 0.1) }))}
          className="px-2 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 font-bold"
        >
          {t('pv.setA')}
        </button>
        <span className="font-mono text-amber-300">{fmt(trim.start)}</span>
        <span className="text-slate-600">→</span>
        <button
          onClick={() => setTrim((p) => ({ ...p, end: Math.max(cur, p.start + 0.1) }))}
          className="px-2 py-1 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 hover:bg-sky-500/30 font-bold"
        >
          {t('pv.setB')}
        </button>
        <span className="font-mono text-sky-300">{fmt(trim.end)}</span>
        <span className="text-slate-500">({(trim.end - trim.start).toFixed(1)}s)</span>
        {trimActive && (
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
            {t('pv.trimOn')}
          </span>
        )}
        <button
          onClick={exportClip}
          disabled={status === 'running'}
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold"
          title={t('pv.exportTip')}
        >
          <Download className="w-3.5 h-3.5" /> {t('pv.exportClip')}
        </button>
      </div>
    </div>
  )
}

function Btn({ onClick, title, children, primary }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={clsx(
        'p-1.5 rounded border transition-colors',
        primary
          ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white'
          : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
      )}
    >
      {children}
    </button>
  )
}

﻿