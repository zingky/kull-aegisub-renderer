import clsx from 'clsx'
import { Languages } from 'lucide-react'
import { LANGS } from '../i18n'

/** Nút chuyển ngôn ngữ UI trên header: Tiếng Việt / English. */
export default function LangSwitch({ lang, onChange, label }) {
  return (
    <div
      title={label}
      className="shrink-0 flex items-center rounded-full border border-slate-700 bg-slate-800/50 p-0.5"
    >
      <Languages className="w-3 h-3 text-slate-400 ml-1.5 mr-1 shrink-0" />
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={() => onChange(l.id)}
          title={l.label}
          aria-pressed={lang === l.id}
          className={clsx(
            'px-1.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide transition-colors',
            lang === l.id ? 'bg-amber-400 text-slate-950' : 'text-slate-400 hover:text-slate-200'
          )}
        >
          {l.short}
        </button>
      ))}
    </div>
  )
}