import clsx from 'clsx'
import { Captions } from 'lucide-react'

const ENGINES = [
  { id: 'vsfiltermod', label: 'VSFilterMod.dll', descKey: 'eng.vsfiltermod.desc' },
  { id: 'vsfilter', label: 'VSFilter.dll', descKey: 'eng.vsfilter.desc' },
  { id: 'libass', label: 'libass (FFmpeg Native)', descKey: 'eng.libass.desc' },
]

export default function EngineSelect({ value, onChange, t }) {
  const vsfilters = ENGINES.slice(0, 2)
  const libass = ENGINES[2]
  return (
    <div>
      {/* Dòng 1: 2 họ VSFilter cạnh nhau */}
      <div className="grid grid-cols-2 gap-1.5">
        {vsfilters.map((e) => (
          <EngineOption key={e.id} e={e} active={value === e.id} onPick={() => onChange(e.id)} t={t} />
        ))}
      </div>
      {/* Dòng 2: libass full-width */}
      <div className="mt-1.5">
        <EngineOption e={libass} active={value === libass.id} onPick={() => onChange(libass.id)} t={t} />
      </div>
    </div>
  )
}

function EngineOption({ e, active, onPick, t }) {
  return (
    <label
      onClick={onPick}
      title={t(e.descKey)}
      className={clsx(
        'cursor-pointer rounded-lg border px-2 py-1.5 block',
        active ? 'border-amber-400 bg-amber-400/10' : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={clsx(
            'w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0',
            active ? 'border-amber-400' : 'border-slate-500'
          )}
        >
          {active && <span className="w-1 h-1 rounded-full bg-amber-400" />}
        </span>
        <span className={clsx('text-[12px] font-semibold truncate', active ? 'text-amber-200' : 'text-slate-200')}>
          {e.label}
        </span>
      </div>
      <p className="hidden 2xl:block text-[10px] text-slate-500 ml-4 mt-px leading-tight truncate">{t(e.descKey)}</p>
    </label>
  )
}