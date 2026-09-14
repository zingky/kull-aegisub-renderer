import { useState } from 'react'
import clsx from 'clsx'
import { SlidersHorizontal } from 'lucide-react'

const CHOICES = [
  {
    id: 'original',
    title: 'Giữ nguyên chất lượng gốc',
    desc: 'Mặc định · tự phân tích bitrate/độ phân giải/fps từng phân đoạn để xuất file tương đồng nhất với file gốc (Constrained VBR: -b:v gốc, -maxrate 1.25×, -bufsize 2×)',
  },
  {
    id: 'high',
    title: 'Chất lượng cao',
    desc: 'Nét 90-95% gốc, dung lượng ~70-80%',
  },
  {
    id: 'balanced',
    title: 'Cân bằng',
    desc: 'Chuẩn tối ưu để chia sẻ mạng xã hội',
  },
  {
    id: 'small',
    title: 'Tiết kiệm dung lượng',
    desc: 'Nén nhỏ tối đa cho máy bộ nhớ thấp',
  },
  {
    id: 'custom',
    title: 'Tùy chỉnh thủ công',
    desc: 'Nhập trực tiếp Resolution, FPS, Bitrate',
  },
]

export default function QualitySelect({ value, onChange, custom, onCustomChange }) {
  const [showNote, setShowNote] = useState(false)
  const set = (k, v) => onCustomChange({ ...custom, [k]: v })

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <SlidersHorizontal className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide">Chất Lượng Render</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {CHOICES.map((c) => (
          <label
            key={c.id}
            onClick={() => onChange(c.id)}
            className={clsx(
              'cursor-pointer rounded-lg border px-3 py-2 transition-colors',
              value === c.id
                ? 'border-amber-400 bg-amber-400/10'
                : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'
            )}
          >
            <div className="flex items-start gap-2">
              <span
                className={clsx(
                  'mt-0.5 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0',
                  value === c.id ? 'border-amber-400' : 'border-slate-500'
                )}
              >
                {value === c.id && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
              </span>
              <div className="min-w-0">
                <span className={clsx('text-[13px] font-semibold', value === c.id ? 'text-amber-200' : 'text-slate-200')}>
                  {c.title}
                </span>
                <p className="text-[11px] text-slate-400 leading-snug mt-0.5">{c.desc}</p>
              </div>
            </div>
          </label>
        ))}
      </div>

      {/* Nhập tay khi chọn "Tùy chỉnh thủ công" */}
      {value === 'custom' && (
        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/60 p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-slate-400">Resolution (WxH)</label>
            <input
              value={custom.resolution}
              onChange={(e) => set('resolution', e.target.value)}
              placeholder="1280x720"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-400">FPS</label>
            <input
              type="number"
              min="1"
              max="120"
              step="0.001"
              value={custom.fps}
              onChange={(e) => set('fps', e.target.value)}
              placeholder="30"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-400">Bitrate (kbps)</label>
            <input
              type="number"
              min="100"
              step="100"
              value={custom.bitrate}
              onChange={(e) => set('bitrate', e.target.value)}
              placeholder="2000"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
            />
          </div>
          <p className="md:col-span-3 text-[11px] text-slate-500">
            Gợi ý: 1080p→4500-6000 kbps · 720p→2500-4000 kbps · 480p→1000-1500 kbps (H.264)
          </p>
        </div>
      )}
      {showNote && null}
    </div>
  )
}