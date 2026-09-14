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
  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
        {ENGINES.map((e) => (
          <label
            key={e.id}
            onClick={() => onChange(e.id)}
            className={clsx(
              'cursor-pointer rounded-lg border px-2 py-1.5 transition-colors',
              value === e.id
                ? 'border-amber-400 bg-amber-400/10'
                : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'
            )}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={clsx(
                  'w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0',
                  value === e.id ? 'border-amber-400' : 'border-slate-500'
                )}
              >
                {value === e.id && <span className="w-1 h-1 rounded-full bg-amber-400" />}
              </span>
              <span className={clsx('text-[12px] font-semibold truncate', value === e.id ? 'text-amber-200' : 'text-slate-200')}>
                {e.label}
              </span>
            </div>
            <p className="hidden 2xl:block text-[10px] text-slate-500 ml-4 mt-px leading-tight truncate">{e.desc}</p>
          </label>
        ))}
      </div>
    </div>
  )
}