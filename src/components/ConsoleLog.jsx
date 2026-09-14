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
      <div className="shrink-0 border-t border-slate-800 bg-[#0a0e17]">
      <div className="flex items-center gap-2 px-3 pt-1.5 pb-1">
        <Terminal className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Console Log</span>
        <span className="text-[10px] text-slate-600">FFmpeg stderr + thông báo hệ thống</span>
      </div>
      <div
        ref={ref}
        className="log-text mx-3 mb-2 h-[104px] overflow-y-auto rounded-lg border border-slate-800 bg-black/40 p-2.5 text-[11px] leading-relaxed"
      >
        {logs.length === 0 ? (
          <p className="text-slate-600 italic">— Chưa có log. Các thông báo sẽ xuất hiện tại đây —</p>
        ) : (
          logs.map((l) => (
            <p key={l.id ?? l.time} className={clsx('whitespace-pre-wrap break-all', LEVEL_STYLE[l.level] || LEVEL_STYLE.info)}>
              <span className="text-slate-600 select-none">[{formatTime(l.time)}] </span>
              {String(l.text ?? '')}
            </p>
          ))
        )}
      </div>
    </div>
  )
}