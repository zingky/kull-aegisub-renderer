import { useEffect, useRef, useState } from 'react'
import { Terminal, Copy, Check } from 'lucide-react'
import clsx from 'clsx'
import { formatTime } from '../utils/format'

const LEVEL_STYLE = {
  info: 'text-slate-400',
  warn: 'text-amber-300',
  error: 'text-red-400',
  success: 'text-emerald-400',
}

export default function ConsoleLog({ logs, embedded = false }) {
  const ref = useRef(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs])

  const copyAll = async () => {
    if (!logs.length) return
    const text = logs.map((l) => `[${formatTime(l.time)}] ${String(l.text ?? '')}`).join('\n')
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      // Fallback cho môi trường không có Clipboard API (ví dụ file:// cũ)
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        ok = document.execCommand('copy')
        document.body.removeChild(ta)
      } catch {
        ok = false
      }
    }
    setCopied(ok)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={embedded ? '' : 'shrink-0 border-t border-slate-800 bg-[#0a0e17]'}>
      <div className={`flex items-center gap-2 ${embedded ? 'px-0.5 pb-1' : 'px-3 pt-1.5 pb-1'}`}>
        <Terminal className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Console Log</span>
        <span className="text-[10px] text-slate-600">FFmpeg stderr + thông báo hệ thống</span>
        <button
          type="button"
          onClick={copyAll}
          disabled={!logs.length}
          title="Copy toàn bộ log vào clipboard"
          className={clsx(
            'ml-auto shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-semibold transition-colors',
            copied
              ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
              : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-amber-500/50 hover:text-amber-300',
            !logs.length && 'opacity-40 cursor-not-allowed'
          )}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Đã copy!' : 'Copy log'}
        </button>
      </div>
      <div
        ref={ref}
        className={
          embedded
            ? 'log-text h-[118px] overflow-y-auto rounded-lg border border-slate-800 bg-black/40 p-2.5 text-[11px] leading-relaxed'
            : 'log-text mx-3 mb-2 h-[104px] overflow-y-auto rounded-lg border border-slate-800 bg-black/40 p-2.5 text-[11px] leading-relaxed'
        }
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