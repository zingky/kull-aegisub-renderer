import clsx from 'clsx'
import { Captions } from 'lucide-react'

const ENGINES = [
  {
    id: 'vsfiltermod',
    label: 'VSFilterMod.dll',
    desc: 'Mặc định · hiệu ứng \u200BAegisub chính xác nhất, karaoke mượt',
  },
  {
    id: 'vsfilter',
    label: 'VSFilter.dll',
    desc: 'Bản xy-VSFilter có TextSub · render qua AviSynth+ bundled',
  },
  {
    id: 'libass',
    label: 'libass (FFmpeg Native)',
    desc: 'Không cần plugin · tốc độ cao nhất',
  },
]

export default function EngineSelect({ value, onChange }) {
  const vsfilters = ENGINES.slice(0, 2)
  const libass = ENGINES[2]
  return (
    <div>
      {/* Dòng 1: 2 họ VSFilter cạnh nhau */}
      <div className="grid grid-cols-2 gap-1.5">
        {vsfilters.map((e) => (
          <EngineOption key={e.id} e={e} active={value === e.id} onPick={() => onChange(e.id)} />
        ))}
      </div>
      {/* Dòng 2: libass full-width */}
      <div className="mt-1.5">
        <EngineOption e={libass} active={value === libass.id} onPick={() => onChange(libass.id)} />
      </div>
    </div>
  )
}

function EngineOption({ e, active, onPick }) {
  return (
    <label
      onClick={onPick}
      className={clsx(
        'cursor-pointer rounded-lg border px-2 py-1.5 transition-colors block',
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
      <p className="hidden 2xl:block text-[10px] text-slate-500 ml-4 mt-px leading-tight truncate">{e.desc}</p>
    </label>
  )
}