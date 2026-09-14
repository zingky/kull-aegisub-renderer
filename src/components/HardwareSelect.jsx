import clsx from 'clsx'
import { Cpu, Gauge } from 'lucide-react'

const OPTIONS = [
  { id: 'auto', label: 'Tự động', sub: 'Ưu tiên GPU', always: true },
  { id: 'nvenc', label: 'NVIDIA NVENC', sub: 'GPU NVIDIA' },
  { id: 'qsv', label: 'Intel QSV', sub: 'GPU Intel' },
  { id: 'amf', label: 'AMD AMF', sub: 'GPU AMD' },
  { id: 'cpu', label: 'CPU (x264/x265)', sub: 'Luôn khả dụng', always: true },
]

export default function HardwareSelect({ value, onChange, available }) {
  const ok = (id) => id === 'auto' || id === 'cpu' || available.includes(id)

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2">
        <Gauge className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide">Phần Cứng Mã Hóa</h3>
        <span className="text-[11px] text-slate-500">(tự phát hiện từ ffmpeg -encoders)</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {OPTIONS.map((o) => {
          const enabled = ok(o.id)
          return (
            <label
              key={o.id}
              onClick={() => enabled && onChange(o.id)}
              className={clsx(
                'cursor-pointer rounded-lg border px-3 py-2 transition-colors text-center',
                !enabled && 'opacity-35 cursor-not-allowed',
                value === o.id
                  ? 'border-amber-400 bg-amber-400/10'
                  : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'
              )}
              title={enabled ? o.sub : 'Không phát hiện được encoder này trên máy'}
            >
              <div className="flex items-center justify-center gap-2">
                <span
                  className={clsx(
                    'w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0',
                    value === o.id ? 'border-amber-400' : 'border-slate-500'
                  )}
                >
                  {value === o.id && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                </span>
                <span className={clsx('text-[13px] font-semibold', value === o.id ? 'text-amber-200' : 'text-slate-200')}>
                  {o.label}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">
                {o.sub}
                {!enabled && ' · không có'}
              </p>
            </label>
          )
        })}
      </div>
      {value === 'auto' && (
        <p className="mt-1.5 text-[11px] text-slate-500 flex items-center gap-1">
          <Cpu className="w-3 h-3" /> Sẽ tự chọn theo thứ tự: NVENC → QSV → AMF → CPU.
        </p>
      )}
    </div>
  )
}