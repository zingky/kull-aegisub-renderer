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
    <div className="mt-2">
      {/* Dòng 1: NVIDIA + AMD */}
      <div className="grid grid-cols-2 gap-1.5">
        <HwOption o={OPTIONS[1]} active={value === 'nvenc'} enabled={ok('nvenc')} onPick={() => onChange('nvenc')} />
        <HwOption o={OPTIONS[3]} active={value === 'amf'} enabled={ok('amf')} onPick={() => onChange('amf')} />
      </div>
      {/* Dòng 2: Intel + CPU */}
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <HwOption o={OPTIONS[2]} active={value === 'qsv'} enabled={ok('qsv')} onPick={() => onChange('qsv')} />
        <HwOption o={OPTIONS[4]} active={value === 'cpu'} enabled={ok('cpu')} onPick={() => onChange('cpu')} />
      </div>
      {/* Dòng 3: Tự động full-width (mặc định) */}
      <div className="mt-1.5">
        <HwOption o={OPTIONS[0]} active={value === 'auto'} enabled onPick={() => onChange('auto')} wide />
      </div>
      {value === 'auto' && (
        <p className="mt-1 text-[10px] text-slate-600 flex items-center gap-1">
          <Cpu className="w-3 h-3" /> Tự chọn: NVENC → QSV → AMF → CPU.
        </p>
      )}
    </div>
  )
}

function HwOption({ o, active, enabled, onPick, wide = false }) {
  return (
    <label
      onClick={() => enabled && onPick()}
      className={clsx(
        'cursor-pointer rounded-lg border px-1.5 py-1.5 transition-colors text-center block',
        !enabled && 'opacity-35 cursor-not-allowed',
        active ? 'border-amber-400 bg-amber-400/10' : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'
      )}
      title={enabled ? (wide ? `${o.label} · ${o.sub}` : o.sub) : 'Không phát hiện được encoder này trên máy'}
    >
      <div className="flex items-center justify-center gap-1.5">
        <span
          className={clsx(
            'w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0',
            active ? 'border-amber-400' : 'border-slate-500'
          )}
        >
          {active && <span className="w-1 h-1 rounded-full bg-amber-400" />}
        </span>
        <span className={clsx('text-[12px] font-semibold truncate', active ? 'text-amber-200' : 'text-slate-200')}>
          {wide ? `${o.label} (${o.sub})` : o.label}
        </span>
      </div>
    </label>
  )
}