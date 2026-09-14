import clsx from 'clsx'
import { GitMerge } from 'lucide-react'

export default function MergeToggle({ checked, onChange }) {
  return (
    <label
      onClick={() => onChange(!checked)}
      className={clsx(
        'flex items-start gap-3 cursor-pointer rounded-xl border px-3 py-2.5 transition-colors select-none',
        checked ? 'border-amber-400/70 bg-amber-400/10' : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'
      )}
    >
      <span
        className={clsx(
          'mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
          checked ? 'bg-amber-400 border-amber-400' : 'border-slate-500 bg-transparent'
        )}
      >
        {checked && (
          <svg viewBox="0 0 24 24" className="w-3 h-3 text-slate-900" fill="none" stroke="currentColor" strokeWidth="4">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
      </span>
      <span>
        <span className="flex items-center gap-2 text-sm font-bold text-slate-100">
          <GitMerge className="w-4 h-4 text-amber-400" />
          Kích hoạt ghép Intro/Outro vào Video chính
        </span>
        <span className="block text-[11px] text-slate-400 mt-0.5">
          Intro/Outro sẽ được tự động Scale + Pad về đúng độ phân giải & FPS của video chính, rồi ghép bằng filter concat.
        </span>
      </span>
    </label>
  )
}