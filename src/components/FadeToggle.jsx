import clsx from 'clsx'
import { Sparkles } from 'lucide-react'

/** Bật/tắt fade đầu & cuối + thời gian fade (ms). Mặc định 100ms. */
export default function FadeToggle({ checked, onChange, ms, onMsChange, t }) {
  return (
    <div className="space-y-1.5">
      <label
        onClick={() => onChange(!checked)}
        title={t('fade.tip')}
        className={clsx(
          'flex items-center gap-2 cursor-pointer rounded-lg border px-2.5 py-2 select-none',
          checked ? 'border-sky-400/70 bg-sky-400/10' : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'
        )}
      >
        <span
          className={clsx(
            'w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
            checked ? 'bg-sky-400 border-sky-400' : 'border-slate-500 bg-transparent'
          )}
        >
          {checked && (
            <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 text-slate-900" fill="none" stroke="currentColor" strokeWidth="4">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
        </span>
        <span className="flex items-center gap-1.5 text-[12px] font-bold text-slate-100 truncate">
          <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          {t('fade.label')}
        </span>
      </label>
      {checked && (
        <div className="flex items-center gap-2 pl-1">
          <span className="text-[11px] text-slate-400">{t('fade.durLabel')}</span>
          <input
            type="number"
            min={50}
            max={3000}
            step={50}
            value={ms}
            onChange={(e) => onMsChange(e.target.value === '' ? '' : Number(e.target.value))}
            onBlur={() => {
              const v = Number(ms)
              if (!Number.isFinite(v) || v < 50) onMsChange(100)
              else if (v > 3000) onMsChange(3000)
            }}
            className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] font-mono text-sky-300 focus:outline-none focus:border-sky-500"
          />
          <span className="text-[11px] text-slate-500">{t('fade.unit')}</span>
        </div>
      )}
    </div>
  )
}
