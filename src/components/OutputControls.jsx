import clsx from 'clsx'
import { FolderOpen, Play, Square, Folder, FolderUp } from 'lucide-react'

export default function OutputControls({
  outputDir,
  setOutputDir,
  outputName,
  setOutputName,
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
      <div className="flex items-center gap-2 mb-2">
        <Folder className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide">Output & Điều Khiển</h3>
      </div>

      {/* Thư mục lưu */}
      <label className="text-[11px] font-semibold text-slate-400">Đường dẫn lưu file xuất</label>
      <div className="mt-1 flex gap-2 mb-3">
        <input
          value={outputDir}
          onChange={(e) => setOutputDir(e.target.value)}
          placeholder="Mặc định: thư mục chứa video chính"
          className="flex-1 min-w-0 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[13px] text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
        />
        <button
          onClick={pickDir}
          className="shrink-0 px-3 rounded-md bg-slate-700/60 hover:bg-slate-600 text-slate-200 transition-colors flex items-center gap-1.5 text-[13px]"
        >
          <FolderOpen className="w-4 h-4" /> Chọn
        </button>
      </div>

      {/* Tên file xuất */}
      <label className="text-[11px] font-semibold text-slate-400">Tên file xuất</label>
      <input
        value={outputName}
        onChange={(e) => setOutputName(e.target.value)}
        placeholder="<tên_gốc>_exported.<đuôi_gốc>"
        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[13px] text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
      />

      {/* Nút bấm chính */}
      <div className="mt-4 flex gap-3">
        <button
          onClick={onStart}
          disabled={status === 'running'}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold uppercase tracking-wider transition-all',
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
            className="flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold uppercase tracking-wider bg-red-500/15 text-red-300 border border-red-500/40 hover:bg-red-500/25 transition-all"
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
          className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/25 transition-all"
        >
          <FolderUp className="w-4 h-4" /> Mở thư mục chứa file xuất
        </button>
      )}
    </div>
  )
}