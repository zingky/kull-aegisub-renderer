import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  Play, Pause, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight,
  SkipBack, SkipForward, Download, Plus, X, Loader2, Film, ExternalLink,
} from 'lucide-react'
import { basename } from '../utils/format'

// Đường dẫn file → URL an toàn (mã hoá space/#/?... — fix preview màn hình đen)
const fileUrl = (p) => 'file:///' + String(p).replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/')

/**
 * VideoPreview — Khung preview hardsub + Trim A→B (v2.0)
 * Nằm trọn vẹn trong Cột 3 (Xem trước & Cắt đoạn A→B)
 * Preview phụ đề: ffmpeg render frame (libass) — không WebGL/WASM, không màn đen.
 */
export default function VideoPreview({ videoPath, subPath, subName, meta, status, outputPath, lang, t }) {
  const videoRef = useRef(null)
  const timelineRef = useRef(null)
  const thumbsDirRef = useRef(null)

  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [duration, setDuration] = useState(meta?.duration || 0)
  const [fps, setFps] = useState(meta?.fps || 24)
  const [trim, setTrim] = useState({ start: 0, end: meta?.duration || 0 })
  const [clips, setClips] = useState([]) // nhiều cặp A→B để xuất nhiều clip trong 1 lần
  const [thumbs, setThumbs] = useState([])
  const [videoError, setVideoError] = useState(false)
  // Frame phụ đề do ffmpeg render (data URL) — CHỈ hiển thị khi video tạm dừng.
  // Không canvas/WebGL → không bao giờ che video bằng mảng đen; lỗi → bỏ qua an toàn.
  const [subFrame, setSubFrame] = useState(null)
  const [frameBusy, setFrameBusy] = useState(false)
  const [frameFail, setFrameFail] = useState(false)
  // Bật/tắt preview phụ đề ASS ngay trên UI (nút CC) — dùng khi file ASS nặng
  // hoặc driver GPU gây lỗi để khôi phục video hiển thị bình thường tức thì.
  const [subsEnabled, setSubsEnabled] = useState(() => {
    try { return localStorage.getItem('kull.subsEnabled') !== '0' } catch (e) { return true }
  })
  // Gợi ý kết quả mở trình phát ngoài (VLC/MPV) — tự ẩn sau vài giây
  const [playerTip, setPlayerTip] = useState(null)
  // Seq + timer hủy request render frame phụ đề cũ (khi seek/đổi file/đổi sub)
  const frameSeqRef = useRef(0)
  const frameTimerRef = useRef(null)
  // Kích thước gốc của video (px) → dùng cho tỉ lệ khung preview.
  // Lấy từ probe, cập nhật lại (chính xác hơn) khi video load xong metadata.
  const [videoSize, setVideoSize] = useState({ w: meta?.width || 0, h: meta?.height || 0 })
  const [ex, setEx] = useState(null) // {i, n, pct} khi đang xuất clip A→B
  const [exDone, setExDone] = useState(false)

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
    setVideoSize({ w: meta?.width || 0, h: meta?.height || 0 })
    setClips([])
  }, [videoPath, meta?.duration, meta?.fps, meta?.width, meta?.height])

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
      setThumbs(res.thumbs.map((x) => ({ t: x.t, url: fileUrl(x.file) })))
    }).catch(() => {})
    return () => { canceled = true }
  }, [videoPath])

  // dọn thumbnail khi unmount
  useEffect(() => () => {
    if (thumbsDirRef.current && window.renderAPI?.cleanupThumbs) window.renderAPI.cleanupThumbs(thumbsDirRef.current)
  }, [])

  // ── Preview phụ đề: render frame bằng CHÍNH ffmpeg + libass (giống hệt bản render) ──
  // Khác hẳn JASSUB (WebGL/WASM dễ chết treo → màn hình đen / không có phụ đề):
  //  • Main process render 1 frame PNG tại đúng vị trí currentTime → trả về data URL.
  //  • Overlay CHỈ hiện khi video tạm dừng và frame đã render xong → không bao giờ
  //    có canvas đen đè lên video; khi phát lại thì ẩn ngay lập tức.
  //  • Seek/đổi file/đổi phụ đề/tắt CC → hủy request cũ (seq) rồi render lại.
  useEffect(() => {
    const v = videoRef.current
    frameSeqRef.current++
    if (frameTimerRef.current) clearTimeout(frameTimerRef.current)
    setSubFrame(null)
    setFrameBusy(false)
    setFrameFail(false)
    const enabled =
      videoPath && subPath && subsEnabled &&
      /\.(ass|ssa|srt)$/i.test(subPath || '') &&
      window.renderAPI?.renderPreviewFrame
    if (!enabled) return undefined

    let disposed = false
    const request = () => {
      if (disposed || !v) return
      const seq = ++frameSeqRef.current
      const timeSec = Math.max(0, v.currentTime || 0)
      setFrameBusy(true)
      window.renderAPI
        .renderPreviewFrame({ videoPath, subPath, timeSec })
        .then((res) => {
          if (disposed || frameSeqRef.current !== seq) return
          setFrameBusy(false)
          if (res?.ok) {
            setSubFrame(res.dataUrl)
            setFrameFail(false)
          } else setFrameFail(true)
        })
        .catch(() => {
          if (disposed || frameSeqRef.current !== seq) return
          setFrameBusy(false)
          setFrameFail(true)
        })
    }
    const schedule = (delay) => {
      if (frameTimerRef.current) clearTimeout(frameTimerRef.current)
      frameTimerRef.current = setTimeout(request, delay)
    }
    const onPause = () => request()
    const onSeeked = () => {
      if (v && !v.paused) return // đang phát → không render (overlay cũng đang ẩn)
      schedule(120)
    }
    const onPlay = () => {
      frameSeqRef.current++ // bỏ request đang dở — không cần frame khi đang phát
      if (frameTimerRef.current) clearTimeout(frameTimerRef.current)
      setFrameBusy(false)
      setSubFrame(null)
    }
    const onSeeking = () => {
      // Đang kéo timeline → hủy request cũ + ẩn frame cũ (không hiện sub sai mốc)
      frameSeqRef.current++
      setFrameBusy(false)
    }

    if (v) {
      v.addEventListener('pause', onPause)
      v.addEventListener('seeked', onSeeked)
      v.addEventListener('play', onPlay)
      v.addEventListener('seeking', onSeeking)
      if (v.readyState >= 1) request()
      else v.addEventListener('loadedmetadata', request, { once: true })
    }
    return () => {
      disposed = true
      frameSeqRef.current++
      if (frameTimerRef.current) clearTimeout(frameTimerRef.current)
      if (v) {
        v.removeEventListener('pause', onPause)
        v.removeEventListener('seeked', onSeeked)
        v.removeEventListener('play', onPlay)
        v.removeEventListener('seeking', onSeeking)
        v.removeEventListener('loadedmetadata', request)
      }
    }
  }, [videoPath, subPath, subsEnabled])

  // Player events + pause khi render
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onT = () => setCur(v.currentTime)
    const onP = () => setPlaying(true)
    const onPa = () => setPlaying(false)
    const onM = () => {
      if (isFinite(v.duration) && v.duration > 0) setDuration(v.duration)
      // videoWidth/videoHeight là kích thước SAU rotation → chuẩn nhất cho tỉ lệ khung preview
      if (v.videoWidth && v.videoHeight) setVideoSize({ w: v.videoWidth, h: v.videoHeight })
    }
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

  // Con trỏ tiến độ mượt (rAF ~60fps) — timeupdate chỉ ~4Hz nên bị giật
  useEffect(() => {
    let raf
    const tick = () => {
      const v = videoRef.current
      if (v && !v.paused && !v.seeking) setCur(v.currentTime)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Nhận % tiến độ khi xuất clip A→B (cùng kênh render:progress)
  useEffect(() => {
    const off = window.renderAPI?.onProgress?.((d) => {
      if (d && d.progress != null) setEx((p) => (p ? { ...p, pct: Math.round(d.progress) } : p))
    })
    return () => off?.()
  }, [])

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
  // Timeline: giữ chuột + rê = seek liên tục (mượt như thanh trượt)
  const onTimelineClick = (e) => {
    seek(timeFromEvent(e))
    const move = (ev) => seek(timeFromEvent(ev))
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  // ── Nhiều cặp A→B: thêm / xóa / xuất nhiều clip trong 1 lần ──
  // A→B CHỈ phục vụ nút "Xuất clip" — KHÔNG nối vào Render hardsub nữa (tách bạch)
  const addClip = () => {
    if (trim.end - trim.start < 0.1) return
    setClips((p) => [...p, { id: Date.now() + p.length, start: trim.start, end: trim.end }])
  }
  const removeClip = (id) => setClips((p) => p.filter((c) => c.id !== id))

  const exportClips = async () => {
    if (!window.renderAPI?.startTrim || status === 'running' || ex) return
    // Chưa thêm clip nào → xuất luôn đoạn A→B đang chọn (khể nút hoạt động mọi lúc)
    const list = clips.length
      ? clips
      : (trim.end - trim.start > 0.1 ? [{ start: trim.start, end: trim.end }] : [])
    if (!list.length) return
    const base = String(outputPath || '').replace(/\.[^.]+$/, '') || 'clip'
    const srcExt = (String(videoPath).match(/\.([^\\.\\/:*?"<>|]+)$/) || [])[1] || 'mp4'
    for (let i = 0; i < list.length; i++) {
      setEx({ i: i + 1, n: list.length, pct: 0 })
      try {
        await window.renderAPI.startTrim({
          mainVideo: videoPath,
          outputPath: `${base}_clip${i + 1}.${srcExt.toLowerCase()}`,
          trim: { start: list[i].start, end: list[i].end },
          lang,
        })
      } catch (e) {
        break // lỗi giữa chừng → dừng, các clip đã xuất vẫn giữ nguyên
      }
    }
    setEx(null)
    setExDone(true)
    setTimeout(() => setExDone(false), 5000)
  }

  // ── Mở video + phụ đề bằng trình phát ngoài (VLC/MPV — libass native) ──
  const openExternal = async () => {
    if (!videoPath || !window.renderAPI?.openInPlayer) return
    try {
      const res = await window.renderAPI.openInPlayer(
        videoPath,
        /\.(ass|ssa|srt)$/i.test(subPath || '') ? subPath : null
      )
      if (!res?.ok) setPlayerTip(t('pv.playerFail'))
      else if (res.player === 'default') setPlayerTip(t('pv.playerMissing'))
      else setPlayerTip(`${t('pv.openedWith')} ${res.player}`)
    } catch (e) {
      setPlayerTip(t('pv.playerFail'))
    }
  }

  // Bật/tắt preview phụ đề trong app (ffmpeg render frame khi tạm dừng)
  const toggleSubs = () => {
    const next = !subsEnabled
    setSubsEnabled(next)
    try { localStorage.setItem('kull.subsEnabled', next ? '1' : '0') } catch (e) {}
  }

  // Tự ẩn gợi ý mở trình phát sau 4 giây
  useEffect(() => {
    if (!playerTip) return
    const id = setTimeout(() => setPlayerTip(null), 4000)
    return () => clearTimeout(id)
  }, [playerTip])

  const inTrim = cur >= trim.start && cur <= trim.end
  const pct = (s) => (duration > 0 ? (s / duration) * 100 : 0)

  // Tỉ lệ khung video → khung preview luôn khớp đúng tỉ lệ (fallback 16:9 khi chưa có metadata).
  // Nhờ vậy video nở hết bề ngang cột 3 mà KHÔNG còn vệt đen letterbox trên/dưới.
  const ratioW = videoSize.w || 16
  const ratioH = videoSize.h || 9

  return (
    <div className="h-full w-full rounded-xl border border-slate-800 bg-[#0f1526]/70 p-2.5 flex flex-col gap-2 min-h-0">
      {/* ── Tiêu đề card Cột 3 ── */}
      <div className="flex items-center justify-between shrink-0 gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2 shrink-0">
          <span>{t('pv.title')}</span>
          {frameBusy && <span className="normal-case text-[10px] text-slate-400">{t('pv.rendering')}</span>}
          {!frameBusy && !frameFail && subFrame && !playing && (
            <span className="normal-case text-[10px] text-emerald-400">ASS live ✓</span>
          )}
          {frameFail && <span className="normal-case text-[10px] text-amber-400">{t('pv.assFail')}</span>}
          {playerTip && <span className="normal-case text-[10px] text-sky-300">{playerTip}</span>}
        </h2>
        <div className="flex items-center gap-1.5 shrink-0 min-w-0">
          {videoPath && (
            <span className="text-[10px] text-slate-500 truncate max-w-[200px]" title={videoPath}>
              {basename(videoPath)}
            </span>
          )}
          {/* Mở bằng VLC/MPV ngoài — libass native, hiển thị phụ đề chuẩn 100% như render */}
          {videoPath && (
            <Btn title={t('pv.openVlc')} onClick={openExternal}>
              <ExternalLink className="w-3.5 h-3.5" />
            </Btn>
          )}
          {/* Nút CC: bật/tắt preview phụ đề (frame render bằng ffmpeg khi tạm dừng) */}
          {subPath && /\.(ass|ssa|srt)$/i.test(subPath || '') && (
            <Btn
              title={subsEnabled ? t('pv.subsOff') : t('pv.subsOn')}
              onClick={toggleSubs}
              className={clsx(
                subsEnabled && !frameFail && 'border-emerald-500/60 text-emerald-300',
                subsEnabled && frameFail && 'border-amber-500/50 text-amber-300'
              )}
            >
              <span className="text-[9px] font-bold leading-none tracking-tight">CC</span>
            </Btn>
          )}
        </div>
      </div>

      {/* ── Khung Video: rộng hết cột, chiều cao theo ĐÚNG tỉ lệ video (không letterbox) ── */}
      <div
        id="pv-frame"
        className="relative w-full min-h-[120px] bg-black/90 rounded-lg overflow-hidden flex items-center justify-center border border-slate-800"
        style={{ aspectRatio: `${ratioW} / ${ratioH}` }}
      >
        {!videoPath ? (
          <div className="flex flex-col items-center justify-center gap-1.5 text-slate-500 p-4 text-center">
            <Film className="w-8 h-8 opacity-40 text-slate-400" />
            <p className="text-[11px]">{t('pv.empty')}</p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              src={videoPath ? fileUrl(videoPath) : undefined}
              preload="metadata"
              className="w-full h-full object-contain cursor-pointer"
              onError={() => setVideoError(true)}
              onClick={togglePlay}
            />
            {/* Frame phụ đề do ffmpeg render — chỉ hiện khi tạm dừng, ẩn ngay khi play */}
            {subsEnabled && subFrame && !playing && !frameBusy && !videoError && (
              <img
                src={subFrame}
                alt=""
                draggable="false"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
              />
            )}
            {videoError && (
              <div className="absolute inset-0 flex items-center justify-center text-center text-[11px] text-amber-300 bg-black/70 p-4">
                {t('pv.codecFail')}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Điều khiển Playback: BÁM NGAY DƯỚI đáy khung video (không ghim đáy card)
             — khung video là phần tử DUY NHẤT co giãn, nên nút + thanh trượt luôn
             dính sát mép dưới khung dù cửa sổ cao/thấp thế nào. ── */}
      <div id="pv-controls" className={clsx('flex flex-col items-center gap-1 shrink-0 text-slate-300', !videoPath && 'opacity-40 pointer-events-none')}>
        <div id="pv-btns" className="flex items-center justify-center gap-1 flex-wrap">
          <Btn onClick={() => seek(0)} title={t('pv.toStart')}><SkipBack className="w-3.5 h-3.5" /></Btn>
          <Btn onClick={() => step(-5)} title="-5s"><ChevronsLeft className="w-3.5 h-3.5" /></Btn>
          <Btn onClick={() => step(-1)} title="-1s"><ChevronLeft className="w-3.5 h-3.5" /></Btn>
          <Btn onClick={() => step(-1 / fps)} title="-1 frame">
            <span className="text-[9px] font-bold leading-none select-none tracking-tighter">◀|</span>
          </Btn>
          <Btn onClick={togglePlay} title="Play/Pause (Space)" primary>
            {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </Btn>
          <Btn onClick={() => step(1 / fps)} title="+1 frame">
            <span className="text-[9px] font-bold leading-none select-none tracking-tighter">|▶</span>
          </Btn>
          <Btn onClick={() => step(1)} title="+1s"><ChevronRight className="w-3.5 h-3.5" /></Btn>
          <Btn onClick={() => step(5)} title="+5s"><ChevronsRight className="w-3.5 h-3.5" /></Btn>
          <Btn onClick={() => seek(duration)} title={t('pv.toEnd')}><SkipForward className="w-3.5 h-3.5" /></Btn>
        </div>
        <div id="pv-time" className="text-[11px] font-mono leading-none">
          <span className={inTrim ? 'text-emerald-400' : 'text-slate-500'}>{fmt(cur)}</span>
          <span className="text-slate-600"> / {fmt(duration)}</span>
        </div>
      </div>

      {/* ── Thanh trượt Timeline + Cắt A-B + Xuất clip (bám sát ngay dưới hàng nút) ── */}
      <div id="pv-timeline" className={clsx('space-y-1.5 shrink-0 pt-0.5', !videoPath && 'opacity-40 pointer-events-none')}>

      <div
        ref={timelineRef}
        className="relative h-8 rounded select-none cursor-pointer bg-slate-900 border border-slate-800 overflow-hidden"
        onMouseDown={onTimelineClick}
      >
        <div className="absolute inset-0 flex opacity-70 pointer-events-none">
          {thumbs.map((x, i) => (
            <img key={i} src={x.url} alt="" className="h-full object-cover flex-1 min-w-0" draggable="false" />
          ))}
        </div>
        {/* Vùng các clip A→B đã thêm (tím) */}
        {clips.map((c) => (
          <div
            key={c.id}
            className="absolute top-0 bottom-0 bg-violet-500/25 border-x border-violet-400 pointer-events-none"
            style={{ left: `${pct(c.start)}%`, width: `${Math.max(0.5, pct(c.end) - pct(c.start))}%` }}
          />
        ))}
        <div
          className="absolute top-0 bottom-0 bg-emerald-400/20 border-x-2 border-emerald-400 pointer-events-none"
          style={{ left: `${pct(trim.start)}%`, width: `${pct(trim.end) - pct(trim.start)}%` }}
        />
        <div className="absolute top-0 bottom-0 w-2 -ml-1 bg-amber-400 rounded cursor-ew-resize" style={{ left: `${pct(trim.start)}%` }} onMouseDown={onTimelineDown('a')} title="A" />
        <div className="absolute top-0 bottom-0 w-2 -ml-1 bg-sky-400 rounded cursor-ew-resize" style={{ left: `${pct(trim.end)}%` }} onMouseDown={onTimelineDown('b')} title="B" />
        {/* Con trỏ vị trí khung hình hiện tại (playhead) */}
        <div className="absolute top-0 bottom-0 w-0.5 -ml-0.5 bg-white shadow-[0_0_5px_rgba(255,255,255,0.9)] pointer-events-none z-10" style={{ left: `${pct(cur)}%` }}>
          <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-white" />
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
        <button
          onClick={() => setTrim((p) => ({ ...p, start: Math.min(cur, p.end - 0.1) }))}
          className="px-2 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 font-bold shrink-0"
        >
          {t('pv.setA')}
        </button>
        <span className="font-mono text-amber-300 shrink-0">{fmt(trim.start)}</span>
        <span className="text-slate-600 shrink-0">→</span>
        <button
          onClick={() => setTrim((p) => ({ ...p, end: Math.max(cur, p.start + 0.1) }))}
          className="px-2 py-1 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 hover:bg-sky-500/30 font-bold shrink-0"
        >
          {t('pv.setB')}
        </button>
        <span className="font-mono text-sky-300 shrink-0">{fmt(trim.end)}</span>
        <span className="text-slate-500 shrink-0">({(trim.end - trim.start).toFixed(1)}s)</span>
        <button
          onClick={addClip}
          className="flex items-center gap-1 px-2 py-1 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-500/30 font-bold shrink-0 ml-auto"
          title={t('pv.clipHint')}
        >
          <Plus className="w-3.5 h-3.5" /> {t('pv.addClip')}
        </button>
        {ex && (
          <span className="flex items-center gap-1.5 font-bold text-violet-300 shrink-0">
            <Loader2 className="w-3 h-3 animate-spin" />
            {t('pv.exporting', { i: ex.i, n: ex.n, pct: ex.pct })}
          </span>
        )}
        {exDone && !ex && (
          <span className="font-bold text-emerald-400 shrink-0">{t('pv.exportOk')}</span>
        )}
        <button
          onClick={exportClips}
          disabled={status === 'running' || !!ex}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold shrink-0"
          title={t('pv.exportTip')}
        >
          <Download className="w-3.5 h-3.5" />{' '}
          {clips.length ? t('pv.exportN', { n: clips.length }) : t('pv.exportClip')}
        </button>
      </div>

      {/* Danh sách clip A→B đã thêm (xuất nhiều clip trong 1 lần) */}
      <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
        {clips.length === 0 ? (
          <span className="text-slate-500">{t('pv.noClip')}</span>
        ) : (
          clips.map((c, i) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/40 font-mono"
            >
              #{i + 1} {fmt(c.start)} → {fmt(c.end)}
              <button onClick={() => removeClip(c.id)} className="text-violet-400 hover:text-red-300" title={t('pv.removeClip')}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))
        )}
      </div>
      </div>
    </div>
  )
}

function Btn({ onClick, title, children, primary, className }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={clsx(
        'w-7 h-7 inline-flex items-center justify-center rounded border transition-colors shrink-0 p-0 text-center leading-none',
        primary
          ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white'
          : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300',
        className
      )}
    >
      {children}
    </button>
  )
}

﻿