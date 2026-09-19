import { useState } from 'react'
import clsx from 'clsx'
import { FileVideo, FileText, Clapperboard, UploadCloud, X, Image } from 'lucide-react'
import { basename, formatBytes, formatDuration } from '../utils/format'

const VIDEO_EXTS = ['mp4', 'mkv', 'avi', 'mov', 'm4v', 'wmv', 'webm', 'ts', 'flv', 'mpg', 'mpeg']
const SUBTITLE_EXTS = ['ass', 'ssa', 'srt']

const ICONS = {
  main: FileVideo,
  subtitle: FileText,
  intro: Clapperboard,
  outro: Clapperboard,
}

const LABEL_KEYS = {
  main: 'dz.main',
  subtitle: 'dz.subtitle',
  intro: 'dz.intro',
  outro: 'dz.outro',
}

const EXT_HINTS = {
  main: '.mp4 .mkv .avi ...',
  subtitle: '.ass .srt',
  intro: '.mp4 .mkv .avi ...',
  outro: '.mp4 .mkv .avi ...',
}

export default function DropZone({ slot, file, meta, onFile, onClear, required = false, disabled = false, t }) {
  const [drag, setDrag] = useState(false)
  const Icon = ICONS[slot] || FileVideo
  const isVideo = slot !== 'subtitle'
  const label = t(LABEL_KEYS[slot])

  const browse = async () => {
    if (disabled) return
    const filters = isVideo
      ? [
          { name: t('dz.filterVideo'), extensions: VIDEO_EXTS },
          { name: t('dz.filterAll'), extensions: ['*'] },
        ]
      : [{ name: t('dz.filterSubtitle'), extensions: SUBTITLE_EXTS }]
    const picked = await window.renderAPI.selectFile({
      title: t('dz.dialogTitle', { label }),
      filters,
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
        'glass-btn relative rounded-lg border p-2 cursor-pointer select-none',
        disabled && 'opacity-40 pointer-events-none',
        drag
          ? 'border-amber-400 bg-amber-400/10'
          : file
            ? 'border-emerald-500/50 bg-emerald-500/5 hover:border-emerald-400'
            : 'border-slate-700 bg-slate-800/30 hover:border-slate-500'
      )}
    >
      {required && !file && (
        <span className="absolute right-2 top-2 text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 leading-none pointer-events-none">
          {t('dz.required')}
        </span>
      )}
      {!file ? (
        <div className="flex items-center gap-2.5">
          <div
            className={clsx(
              'shrink-0 w-8 h-8 rounded-md flex items-center justify-center',
              'bg-slate-700/60 text-slate-300'
            )}
          >
            {drag ? <UploadCloud className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
          </div>
          <div className="min-w-0 flex-1">
            {/* Dòng 1: tên ô + badge BẮT BUỘC neo cứng mép phải */}
            <p className="text-[13px] font-semibold text-slate-200 leading-tight truncate pr-16">
              {label}
            </p>
            {/* Dòng 2: ghi chú định dạng */}
            <p className="text-[11px] text-slate-500 leading-tight truncate">
              {EXT_HINTS[slot]}
            </p>
            {meta && (
              <p className="text-[11px] text-slate-400 truncate">
                {meta.width ? `${meta.width}×${meta.height}` : '??'} ·{' '}
                {meta.fps ? `${meta.fps}fps` : '??fps'} ·{' '}
                {formatDuration(meta.duration)} · {formatBytes(meta.sizeBytes)}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2.5">
          <div className="shrink-0 w-8 h-8 rounded-md bg-emerald-500/15 text-emerald-300 flex items-center justify-center">
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-slate-100 truncate leading-tight" title={file}>
              {basename(file)}
            </p>
            <p className="text-[11px] text-slate-400 truncate">
              {meta ? (
                <>
                  {meta.width ? `${meta.width}×${meta.height}` : '??'} ·{' '}
                  {meta.fps ? `${meta.fps}fps` : '??fps'} ·{' '}
                  {formatDuration(meta.duration)} · {formatBytes(meta.sizeBytes)}
                </>
              ) : isVideo ? (
                <span className="text-amber-300/80">{t('dz.analyzing')}</span>
              ) : (
                t('dz.subtitleReady')
              )}
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClear?.()
            }}
            className="shrink-0 p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title={t('dz.remove')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {disabled && (
        <div className="absolute inset-0 bg-slate-950/40 rounded-xl flex items-center justify-center">
          <span className="text-[11px] font-medium text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded-full border border-slate-700">
            <Image className="inline w-3 h-3 mr-1 -mt-0.5" />
            {t('dz.needMerge')}
          </span>
        </div>
      )}
    </div>
  )
}