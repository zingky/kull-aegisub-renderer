import React from 'react'

/**
 * ErrorBoundary — "lưới an toàn" cho toàn bộ UI.
 * Nếu một component con ném lỗi trong lúc render, thay vì React unmount
 * toàn bộ cây (chỉ còn nền xanh-đen), boundary sẽ giữ lại giao diện
 * và hiển thị rõ lỗi để người dùng copy báo cáo.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Ghi ra console của DevTools để debug sâu nếu cần
    console.error('[Kull Renderer] UI crash:', error, info?.componentStack)
  }

  render() {
    if (this.state.error) {
      const msg = String(this.state.error?.message || this.state.error)
      const stack = String(this.state.error?.stack || '')
      return (
        <div className="min-h-screen bg-[#0b0f19] text-slate-200 flex items-center justify-center p-6">
          <div className="max-w-xl w-full rounded-xl border border-red-500/50 bg-red-500/10 p-5">
            <h1 className="text-base font-bold text-red-300">⚠ Giao diện gặp lỗi (không mất dữ liệu)</h1>
            <p className="mt-1 text-[13px] text-slate-300 break-words">{msg}</p>
            <pre className="mt-3 max-h-56 overflow-auto rounded-lg bg-black/50 p-3 text-[11px] text-slate-400 whitespace-pre-wrap break-all">
              {stack.slice(0, 2000)}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-4 rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950 hover:brightness-110"
            >
              Thử hiển thị lại
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
