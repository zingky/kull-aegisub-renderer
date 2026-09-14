import { useEffect, useRef } from 'react'
import { Terminal } from 'lucide-react'
import clsx from 'clsx'
import { formatTime } from '../utils/format'

const LEVEL_STYLE = {
  info: 'text-slate-400',
  warn: 'text-amber-300',
  error: 'text-red-400',
  success: 'text-emerald-400',
}

export default function ConsoleLog({ logs }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs])

  return (
    <div className="border-t border-slate-800 bg-[#0a0e17]">
      <div className="flex items-center gap-2 px-4 py-2">
        <Terminal className="w-4 h-4 text-amber-400" />
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Console Log</span>
        <span className="text-[11px] text-slate-600">FFmpeg stderr + thông báo hệ thống</span>
      </div>
      <div
        ref={ref}
        className="log-text mx-4 mb-3 h-40 overflow-y-auto rounded-lg border border-slate-800 bg-black/40 p-3 text-[11.5px] leading-relaxed"
      >
        {logs.length === 0 ? (
          <p className="text-slate-600 italic">— Chưa có log. Các thông báo sẽ xuất hiện tại đây —</p>
        ) : (
          logs.map((l, i) => (
            <p key={i} className={clsx('whitespace-pre-wrap break-all', LEVEL_STYLE[l.level] || LEVEL_STYLE.info)}>
              <span className="text-slate-600 select-none">[{l.time}] </span>
              {l.text}
            </p>
          ))
        )}
      </div>
    </div>
  )
}