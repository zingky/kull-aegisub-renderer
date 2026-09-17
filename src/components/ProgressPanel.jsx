import clsx from 'clsx'
import { Loader2, AlertTriangle, CheckCircle2, Gauge, Timer, Zap } from 'lucide-react'
import { formatEta } from '../utils/format'

export default function ProgressPanel({ status, progress, outputPath, t }) {
  const pct = Math.round(progress.pct * 10) / 10

  if (status === 'running') {
    return (
      <div className="mt-2">
        <div className="flex items-center justify-between text-[11px] mb-1">
          <span className="font-semibold text-slate-300 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
            {t('pg.rendering')}
          </span>
          <span className="font-mono font-bold text-amber-300">{pct.toFixed(1)}%</span>
        </div>
        <div className="h-2 rounded-full bg-slate-800 overflow-hidden border border-slate-700/60">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-[width] duration-300"
            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
          />
        </div>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <Gauge className="w-3 h-3 text-amber-400/80" />
            {t('pg.fps')}: <b className="text-slate-200">{progress.fps ? progress.fps.toFixed(1) : '…'}</b>
          </span>
          <span className="flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-400/80" />
            <b className="text-slate-200">{progress.speed ? `${progress.speed.toFixed(2)}×` : '…'}</b>
          </span>
          <span className="flex items-center gap-1">
            <Timer className="w-3 h-3 text-amber-400/80" />
            {t('pg.eta')} <b className="text-slate-200">{progress.eta != null ? formatEta(progress.eta, t) : '…'}</b>
          </span>
        </div>
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div className="mt-4 flex items-start gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-[13px]">
          <p className="font-bold text-emerald-300">{t('pg.doneTitle')}</p>
          <p className="text-slate-400 mt-0.5 break-all">
            {t('pg.outputFile')} {outputPath || t('pg.unknown')}
          </p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="mt-4 flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3">
        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        <div className="text-[13px]">
          <p className="font-bold text-red-300">{t('pg.errorTitle')}</p>
          <p className="text-slate-400 mt-0.5">{t('pg.errorHint')}</p>
        </div>
      </div>
    )
  }

  // idle: thanh "chờ render" gọn 1 dòng
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-slate-800/70 border border-slate-700/40 overflow-hidden">
        <div className="h-full w-0" />
      </div>
      <p className="shrink-0 text-[11px] text-slate-600">
        {t('pg.idlePre')} <b className="text-slate-400">{t('out.start')}</b>
        {t('pg.idlePost')}
      </p>
    </div>
  )
}