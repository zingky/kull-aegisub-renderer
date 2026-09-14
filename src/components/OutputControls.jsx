import clsx from 'clsx'
import { FolderOpen, Play, Square, FolderUp } from 'lucide-react'

const FORMATS = [
  { id: 'mp4', label: 'MP4', desc: 'Phổ biến nhất · xem mọi nơi, up Youtube/Facebook' },
  { id: 'mkv', label: 'MKV', desc: 'Chất lượng cao · giữ nhiều track audio/sub' },
  { id: 'mov', label: 'MOV', desc: 'Chuẩn Apple · dựng phim Final Cut/Premiere' },
  { id: 'webm', label: 'WebM', desc: 'Nhẹ · tối ưu phát trực tuyến trên web' },
  { id: 'avi', label: 'AVI', desc: 'Tương thích máy cũ, đầu phát cổ' },
]

export default function OutputControls({
  outputDir,
  setOutputDir,
  outputName,
  setOutputName,
  outputFormat,
  setOutputFormat,
  status,
  onStart,
  onCancel,
  onOpenFolder,
}) {
  const pickDir = async () => {
    const d = await window.renderAPI.selectDir()
    if (d) setOutputDir(d)
  }

  return (
    <div>
      {/* Thư mục lưu + tên file + định dạng trên cùng 1 dòng */}
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <div className="min-w-0">
          <label className="text-[10px] font-semibold text-slate-500">Thư mục lưu</label>
          <div className="mt-0.5 flex gap-1.5">
            <input
              value={outputDir}
              onChange={(e) => setOutputDir(e.target.value)}
              placeholder="Mặc định: thư mục video chính"
              className="flex-1 min-w-0 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[12px] text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
            />
            <button
              onClick={pickDir}
              className="shrink-0 px-2.5 rounded-md bg-slate-700/60 hover:bg-slate-600 text-slate-200 transition-colors flex items-center gap-1 text-[12px]"
            >
              <FolderOpen className="w-3.5 h-3.5" /> Chọn
            </button>
          </div>
        </div>
        <div className="min-w-0">
          <label className="text-[10px] font-semibold text-slate-500">Tên file xuất</label>
          <input
            value={outputName}
            onChange={(e) => setOutputName(e.target.value)}
            placeholder="<tên_gốc>_exported"
            className="mt-0.5 w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[12px] text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
          />
        </div>
        <div className="min-w-0">
          <label className="text-[10px] font-semibold text-slate-500">Định dạng</label>
          <div className="mt-0.5 flex gap-1">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => setOutputFormat(f.id)}
                title={f.desc}
                className={clsx(
                  'glass-btn px-2 py-1 rounded-md border text-[11px] font-bold uppercase tracking-wide',
                  outputFormat === f.id
                    ? 'border-amber-400 bg-amber-400/10 text-amber-200'
                    : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Nút bấm chính */}
      <div className="mt-2 flex gap-2">
        <button
          onClick={onStart}
          disabled={status === 'running'}
          className={clsx(
            'glass-btn flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-[13px] font-bold uppercase tracking-wider',
            status === 'running'
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-amber-400 to-orange-600 text-slate-950 hover:brightness-110 active:scale-[0.99] shadow-lg shadow-orange-900/30'
          )}
        >
          <Play className="w-4 h-4 fill-current" />
          BẮT ĐẦU RENDER
        </button>
        {status === 'running' && (
          <button
            onClick={onCancel}
            className="glass-btn flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-[13px] font-bold uppercase tracking-wider bg-red-500/15 text-red-300 border border-red-500/40 hover:bg-red-500/25"
          >
            <Square className="w-4 h-4 fill-current" />
            HỦY
          </button>
        )}
      </div>

      {/* Nút mở thư mục khi render xong */}
      {status === 'done' && (
        <button
          onClick={onOpenFolder}
          className="glass-btn mt-2 w-full flex items-center justify-center gap-2 rounded-lg px-4 py-1.5 text-[12px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/25"
        >
          <FolderUp className="w-3.5 h-3.5" /> Mở thư mục chứa file xuất
        </button>
      )}
    </div>
  )
}