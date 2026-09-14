import clsx from 'clsx'

const CHOICES = [
  {
    id: 'original',
    title: 'Giữ nguyên gốc',
    desc: 'Mặc định · giữ 100% res/fps, bitrate Constrained VBR theo file gốc',
  },
  {
    id: 'high',
    title: 'Chất lượng cao',
    desc: 'Nét 90-95% gốc, dung lượng ~70-80%',
  },
  {
    id: 'balanced',
    title: 'Cân bằng',
    desc: 'Tối ưu chia sẻ mạng xã hội',
  },
  {
    id: 'small',
    title: 'Tiết kiệm',
    desc: 'Nén nhỏ tối đa',
  },
  {
    id: 'custom',
    title: 'Tùy chỉnh',
    desc: 'Nhập Resolution, FPS, Bitrate',
  },
]

export default function QualitySelect({ value, onChange, custom, onCustomChange }) {
  const set = (k, v) => onCustomChange({ ...custom, [k]: v })
  const byId = (id) => CHOICES.find((c) => c.id === id)

  return (
    <div>
      {/* Hàng 1: Cao · Cân bằng · Tiết kiệm */}
      <div className="grid grid-cols-3 gap-1.5" id="qrow-presets">
        {['high', 'balanced', 'small'].map((id) => (
          <QualityOption key={id} c={byId(id)} active={value === id} onPick={() => onChange(id)} />
        ))}
      </div>
      {/* Hàng 2: Giữ nguyên gốc · Tùy chỉnh */}
      <div className="mt-1.5 grid grid-cols-2 gap-1.5" id="qrow-anchor">
        {['original', 'custom'].map((id) => (
          <QualityOption key={id} c={byId(id)} active={value === id} onPick={() => onChange(id)} />
        ))}
      </div>

      {/* Nhập tay khi chọn "Tùy chỉnh thủ công" */}
      {value === 'custom' && (
        <div className="mt-1.5 rounded-lg border border-slate-700 bg-slate-900/60 p-2 grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] font-semibold text-slate-500">Resolution</label>
            <input
              value={custom.resolution}
              onChange={(e) => set('resolution', e.target.value)}
              placeholder="1280x720"
              className="mt-0.5 w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[12px] text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500">FPS</label>
            <input
              type="number"
              min="1"
              max="120"
              step="0.001"
              value={custom.fps}
              onChange={(e) => set('fps', e.target.value)}
              placeholder="30"
              className="mt-0.5 w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[12px] text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500">Bitrate (kbps)</label>
            <input
              type="number"
              min="100"
              step="100"
              value={custom.bitrate}
              onChange={(e) => set('bitrate', e.target.value)}
              placeholder="2000"
              className="mt-0.5 w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[12px] text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
            />
          </div>
          <p className="col-span-3 text-[10px] text-slate-600">
            Gợi ý: 1080p→4500-6000 · 720p→2500-4000 · 480p→1000-1500 kbps (H.264)
          </p>
        </div>
      )}
    </div>
  )
}

function QualityOption({ c, active, onPick }) {
  return (
    <label
      onClick={onPick}
      title={c.desc}
      className={clsx(
        'glass-btn cursor-pointer rounded-lg border px-2 py-1 text-center block',
        active ? 'border-amber-400 bg-amber-400/10' : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'
      )}
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
          {c.title}
        </span>
      </div>
    </label>
  )
}