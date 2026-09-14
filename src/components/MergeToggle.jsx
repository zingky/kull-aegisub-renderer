import clsx from 'clsx'
import { GitMerge } from 'lucide-react'

export default function MergeToggle({ checked, onChange }) {
  return (
    <label
      onClick={() => onChange(!checked)}
      title="Intro/Outro sẽ được tự động Scale + Pad về đúng độ phân giải & FPS của video chính, rồi ghép bằng filter concat."
      className={clsx(
        'flex items-center gap-2 cursor-pointer rounded-lg border px-2.5 py-2 transition-colors select-none',
        checked ? 'border-amber-400/70 bg-amber-400/10' : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'
      )}
    >
      <span
        className={clsx(
          'w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
          checked ? 'bg-amber-400 border-amber-400' : 'border-slate-500 bg-transparent'
        )}
      >
        {checked && (
          <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 text-slate-900" fill="none" stroke="currentColor" strokeWidth="4">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
      </span>
      <span className="flex items-center gap-1.5 text-[12px] font-bold text-slate-100 truncate">
        <GitMerge className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        Ghép Intro/Outro vào Video chính
      </span>
    </label>
  )
}