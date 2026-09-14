import { useState } from 'react'
import clsx from 'clsx'
import { FileVideo, FileText, Clapperboard, UploadCloud, X, Image } from 'lucide-react'
import { basename, formatBytes, formatDuration } from '../utils/format'

const VIDEO_FILTERS = [
  { name: 'Video', extensions: ['mp4', 'mkv', 'avi', 'mov', 'm4v', 'wmv', 'webm', 'ts', 'flv', 'mpg', 'mpeg'] },
  { name: 'Tất cả', extensions: ['*'] },
]
const SUBTITLE_FILTERS = [{ name: 'Subtitle', extensions: ['ass', 'ssa', 'srt'] }]

const ICONS = {
  main: FileVideo,
  subtitle: FileText,
  intro: Clapperboard,
  outro: Clapperboard,
}

const LABELS = {
  main: 'File Video chính',
  subtitle: 'File Subtitle',
  intro: 'File Video Intro (ghép đầu)',
  outro: 'File Video Outro (ghép cuối)',
}

const EXT_HINTS = {
  main: '.mp4 .mkv .avi ...',
  subtitle: '.ass .srt',
  intro: '.mp4 .mkv .avi ...',
  outro: '.mp4 .mkv .avi ...',
}

export default function DropZone({ slot, file, meta, onFile, onClear, required = false, disabled = false }) {
  const [drag, setDrag] = useState(false)
  const Icon = ICONS[slot] || FileVideo
  const isVideo = slot !== 'subtitle'

  const browse = async () => {
    if (disabled) return
    const picked = await window.renderAPI.selectFile({
      title: `Chọn ${LABELS[slot]}`,
      filters: isVideo ? VIDEO_FILTERS : SUBTITLE_FILTERS,
    })
    if (picked) onFile(picked)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDrag(false)
    if (disabled) return
    const f = e.dataTransfer?.files?.[0]
    if (f) onFile(window.renderAPI.getPathForFile(f))
  }

  return (
    <div
      onClick={browse}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      className={clsx(
        'group relative rounded-xl border-2 border-dashed p-4 transition-colors cursor-pointer select-none',
        disabled && 'opacity-40 pointer-events-none',
        drag
          ? 'border-amber-400 bg-amber-400/10'
          : file
            ? 'border-emerald-500/50 bg-emerald-500/5 hover:border-emerald-400'
            : 'border-slate-700 bg-slate-800/30 hover:border-slate-500'
      )}
    >
      {/* Badge yêu cầu */}
      {required && (
        <span className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40">
          BẮT BUỘC
        </span>
      )}

      {!file ? (
        <div className="flex items-center gap-4">
          <div
            className={clsx(
              'shrink-0 w-11 h-11 rounded-lg flex items-center justify-center',
              'bg-slate-700/60 text-slate-300 group-hover:text-amber-300 group-hover:bg-slate-700'
            )}
          >
            {drag ? <UploadCloud className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-200">{LABELS[slot]}</p>
            <p className="text-xs text-slate-500">
              Kéo thả vào đây hoặc bấm để chọn · nhận {EXT_HINTS[slot]}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="shrink-0 w-11 h-11 rounded-lg bg-emerald-500/15 text-emerald-300 flex items-center justify-center">
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-100 truncate" title={file}>
              {basename(file)}
            </p>
            <p className="text-xs text-slate-400">
              {meta ? (
                <>
                  {meta.width ? `${meta.width}×${meta.height}` : '??'} ·{' '}
                  {meta.fps ? `${meta.fps}fps` : '??fps'} ·{' '}
                  {formatDuration(meta.duration)} · {formatBytes(meta.sizeBytes)}
                </>
              ) : isVideo ? (
                <span className="text-amber-300/80">đang phân tích…</span>
              ) : (
                'subtitle đã sẵn sàng'
              )}
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClear?.()
            }}
            className="shrink-0 p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Xóa file"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {disabled && (
        <div className="absolute inset-0 bg-slate-950/40 rounded-xl flex items-center justify-center">
          <span className="text-[11px] font-medium text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded-full border border-slate-700">
            <Image className="inline w-3 h-3 mr-1 -mt-0.5" />
            Cần bật "Ghép Intro/Outro"
          </span>
        </div>
      )}
    </div>
  )
}