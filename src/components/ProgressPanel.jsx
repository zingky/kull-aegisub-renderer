import clsx from 'clsx'
import { Loader2, AlertTriangle, CheckCircle2, Gauge, Timer, Zap } from 'lucide-react'
import { formatDuration } from '../utils/format'

export default function ProgressPanel({ status, progress, outputPath }) {
  const pct = Math.round(progress.pct * 10) / 10

  if (status === 'running') {
    return (
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="font-semibold text-slate-300 flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
            Đang render…
          </span>
          <span className="font-mono font-bold text-amber-300">{pct.toFixed(1)}%</span>
        </div>
        <div className="h-3 rounded-full bg-slate-800 overflow-hidden border border-slate-700/60">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-[width] duration-300"
            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
          />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Gauge className="w-3.5 h-3.5 text-amber-400/80" />
            <span>
              FPS render: <b className="text-slate-200">{progress.fps ? progress.fps.toFixed(1) : '…'}</b>
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            <Zap className="w-3.5 h-3.5 text-amber-400/80" />
            <span>
              Tốc độ: <b className="text-slate-200">{progress.speed ? `${progress.speed.toFixed(2)}×` : '…'}</b>
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            <Timer className="w-3.5 h-3.5 text-amber-400/80" />
            <span>
              Còn lại: <b className="text-slate-200">{progress.eta != null ? formatDuration(progress.eta) : '…'}</b>
            </span>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div className="mt-4 flex items-start gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-[13px]">
          <p className="font-bold text-emerald-300">Render thành công 100%</p>
          <p className="text-slate-400 mt-0.5 break-all">File xuất: {outputPath || '(chưa xác định)'}</p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="mt-4 flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3">
        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        <div className="text-[13px]">
          <p className="font-bold text-red-300">Render thất bại</p>
          <p className="text-slate-400 mt-0.5">Xem chi tiết lỗi trong Console Log bên dưới.</p>
        </div>
      </div>
    )
  }

  // idle: thanh "chờ render"
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="font-semibold text-slate-500">Trạng thái</span>
        <span className="text-slate-500 font-mono">0%</span>
      </div>
      <div className="h-3 rounded-full bg-slate-800/70 border border-slate-700/40 overflow-hidden">
        <div className="h-full w-0" />
      </div>
      <p className={clsx('mt-2 text-[12px]')}>Chưa có tác vụ. Chọn file &amp; bấm <b>BẮT ĐẦU RENDER</b>.</p>
    </div>
  )
}