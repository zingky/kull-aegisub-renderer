// src/renderAPI.ts — Cầu nối API cho Kull Aegisub Renderer.
// Hỗ trợ cả Electron (window.renderAPI) và Tauri (@tauri-apps/api invoke/event).
// Giao diện giống hệt window.renderAPI của Electron để UI không cần đổi nhiều.

import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const isTauri = typeof window !== 'undefined' && (window as any).__TAURI__ !== undefined;
const isElectron = typeof window !== 'undefined' && !!(window as any).renderAPI;

type RenderEventHandler = (payload: any) => void;

// ── Chuẩn hoá payload sự kiện từ Rust (render:event) về đúng dạng UI đang dùng ──
// Rust serialize enum kiểu {"Progress": {...}} / {"Log": {...}} / {"Done": {...}} / {"Error": {...}}
// và field trong Rust là snake_case, còn UI đọc camelCase → phải map lại tại đây.

const LEVEL_MAP: Record<string, string> = {
  Info: 'info', Warn: 'warn', Success: 'success', Error: 'error',
  info: 'info', warn: 'warn', success: 'success', error: 'error',
};

function normalizeProgress(p: any): any {
  if (!p) return null;
  const pct = p.pct ?? p.progress ?? 0;
  return {
    progress: pct, // UI cũ đọc d.progress
    pct,
    fps: p.fps ?? null,
    speed: p.speed ?? null,
    eta: p.eta ?? null,
    frame: p.frame ?? null,
    bitrate: p.bitrateKbps ?? p.bitrate_kbps ?? p.bitrate ?? null,
    sizeKB: p.sizeKb ?? p.size_kb ?? p.sizeKB ?? null,
    time: p.time ?? '',
    avgSpeed: p.avgSpeed ?? p.avg_speed ?? null,
  };
}

function normalizeLog(l: any): any {
  if (!l) return { line: '', level: 'info' };
  return {
    line: l.message ?? l.line ?? String(l),
    level: LEVEL_MAP[l.level] ?? l.level ?? 'info',
    time: l.time,
  };
}

function normalizeDone(d: any): any {
  if (!d) return { outputPath: '', canceled: false };
  return {
    outputPath: d.outputPath ?? d.output_path ?? '',
    duration: d.duration ?? 0,
    elapsed: d.elapsed ?? d.elapsed_sec ?? d.elapsedSec ?? null,
    canceled: !!d.canceled,
  };
}

/** EngineError của Rust → { message, detail } dễ đọc. */
function normalizeError(e: any): any {
  if (e == null) return { message: 'Lỗi không xác định' };
  if (typeof e === 'string') return { message: e };
  if (e.Start) return { message: `Không khởi động được FFmpeg: ${e.Start.msg ?? ''}` };
  if (e.Run) return { message: `Không chạy được FFmpeg: ${e.Run.msg ?? ''}` };
  if (e.Exit) {
    const detail = e.Exit.detail ?? '';
    return { message: `FFmpeg thoát với mã ${e.Exit.code ?? '?'}`, detail };
  }
  if (e.Generic) return { message: `Render thất bại: ${e.Generic.msg ?? ''}` };
  if (e.Probe) return { message: `Lỗi đọc file media: ${e.Probe.msg ?? ''}` };
  if (e.Io) return { message: `Lỗi I/O: ${e.Io.msg ?? ''}` };
  if (e.Canceled !== undefined) return { message: 'Đã hủy bởi người dùng.' };
  if (e.message) return { message: e.message, detail: e.detail };
  return { message: JSON.stringify(e) };
}

// ── Helpers ──
function tauriInvoke(cmd: string, args: any = {}): Promise<any> {
  return invoke(cmd, args);
}

function tauriListen(channel: string, cb: (payload: any) => void): () => void {
  let un: (() => void) | null = null;
  let disposed = false;
  listen(channel, (event: any) => cb(event.payload))
    .then((fn) => {
      if (disposed) fn();
      else un = fn;
    })
    .catch((err) => {
      // Thiếu quyền core:event → sự kiện không bao giờ tới UI.
      // Báo rõ lên Console Log thay vì im lặng kẹt 0%.
      console.error('[renderAPI] listen failed:', channel, err);
      window.dispatchEvent(
        new CustomEvent('kull:listener-error', { detail: { channel, error: String(err) } })
      );
    });
  return () => {
    disposed = true;
    if (un) un();
  };
}

/** Đường dẫn file cục bộ → URL xem được trong WebView (Tauri dùng asset protocol). */
export function fileSrc(p: string): string {
  if (!p) return '';
  if (isElectron) {
    return 'file:///' + String(p).replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
  }
  try {
    return convertFileSrc(p);
  } catch {
    return '';
  }
}

// ── renderAPI (giống window.renderAPI của Electron) ──
const renderAPI = {
  init: (resourcesPath?: string, projectRoot?: string) =>
    tauriInvoke('init', { resourcesPath, projectRoot }),

  getPathForFile: (file: File): string =>
    isElectron ? (window as any).renderAPI.getPathForFile(file) : file.name,

  probeMedia: async (filePath: string, lang: string) => {
    const m = await tauriInvoke('probe_media', { filePath, lang });
    if (!m) return m;
    // Rust trả MediaMeta (camelCase) → bổ sung alias UI đang dùng
    return {
      ...m,
      bitrateAvg: m.bitrateAvg ?? m.bitrateAvgKbps ?? m.bitrate_avg_kbps ?? 0,
      sizeBytes: m.sizeBytes ?? m.size_bytes ?? 0,
    };
  },

  selectFile: (opts: any) =>
    tauriInvoke('select_file', {
      title: opts?.title,
      filter: opts?.filters?.map((f: any) => f.extensions.join(',')).join(','),
    }),

  selectDir: (lang: string) =>
    tauriInvoke('select_dir', { lang }),

  startRender: (options: any) => tauriInvoke('start_render', { options }),

  cancelRender: () => tauriInvoke('cancel_render'),

  openFolder: async (dirPath: string) => {
    if (isElectron) return (window as any).renderAPI.openFolder(dirPath);
    // UI coi giá trị trả về là "thông báo lỗi" (null = thành công)
    try {
      await tauriInvoke('open_folder', { dirPath });
      return null;
    } catch (e) {
      return typeof e === 'string' ? e : ((e as any)?.message ?? String(e));
    }
  },

  openInPlayer: (videoPath: string, subPath: string) =>
    isElectron ? (window as any).renderAPI.openInPlayer(videoPath, subPath) : Promise.resolve({ ok: false, player: null }),

  checkBin: () => tauriInvoke('check_bin'),

  getEncoders: () => tauriInvoke('detect_encoders'),

  getAppVersion: () => tauriInvoke('get_app_version'),

  startTrim: (options: any) =>
    isElectron
      ? (window as any).renderAPI.startTrim(options)
      : tauriInvoke('start_trim', options),

  extractThumbs: async (videoPath: string) => {
    if (isElectron) return (window as any).renderAPI.extractThumbs(videoPath);
    return tauriInvoke('extract_thumbs', { videoPath, count: 12 });
  },

  subtitleInfo: (path: string) => tauriInvoke('subtitle_info', { path }),

  cleanupThumbs: (dir: string) =>
    isElectron ? (window as any).renderAPI.cleanupThumbs(dir) : tauriInvoke('cleanup_thumbs', { dir }),

  readFileText: (filePath: string) =>
    isElectron ? (window as any).renderAPI.readFileText(filePath) : Promise.resolve(''),

  renderPreviewFrame: async (opts: any) => {
    if (isElectron) return (window as any).renderAPI.renderPreviewFrame(opts);
    const r = await tauriInvoke('render_preview_frame', {
      videoPath: opts.videoPath,
      subPath: opts.subPath,
      timeSec: opts.timeSec,
      engine: opts.engine,
    });
    if (r && r.ok && r.path) {
      return { ...r, dataUrl: fileSrc(r.path) };
    }
    return r || { ok: false };
  },

  cancelPreviewFrame: () => {
    if (isElectron) (window as any).renderAPI.cancelPreviewFrame();
  },

  fitWindowHeight: (delta: number) =>
    isElectron ? (window as any).renderAPI.fitWindowHeight(delta) : Promise.resolve(null),

  // Sự kiện đẩy từ backend về UI (phương thức thống nhất: render:event từ Tauri)
  onProgress: (cb: RenderEventHandler): (() => void) => {
    if (isElectron) {
      return (window as any).renderAPI.onProgress(cb);
    }
    return tauriListen('render:event', (payload: any) => {
      if (payload && payload.Progress) cb(normalizeProgress(payload.Progress));
    });
  },

  onLog: (cb: RenderEventHandler): (() => void) => {
    if (isElectron) {
      return (window as any).renderAPI.onLog(cb);
    }
    return tauriListen('render:event', (payload: any) => {
      if (payload && payload.Log) cb(normalizeLog(payload.Log));
    });
  },

  onDone: (cb: RenderEventHandler): (() => void) => {
    if (isElectron) {
      return (window as any).renderAPI.onDone(cb);
    }
    return tauriListen('render:event', (payload: any) => {
      if (payload && payload.Done) cb(normalizeDone(payload.Done));
    });
  },

  onError: (cb: RenderEventHandler): (() => void) => {
    if (isElectron) {
      return (window as any).renderAPI.onError(cb);
    }
    return tauriListen('render:event', (payload: any) => {
      if (payload && payload.Error) cb(normalizeError(payload.Error));
    });
  },

  // Sự kiện xuất clip A→B (kênh riêng, không ảnh hưởng trạng thái render chính)
  onTrimEvent: (cb: (e: { type: 'progress' | 'log' | 'done' | 'error'; data: any }) => void): (() => void) => {
    if (isElectron) return () => {};
    return tauriListen('trim:event', (payload: any) => {
      if (!payload) return;
      if (payload.Progress) cb({ type: 'progress', data: normalizeProgress(payload.Progress) });
      else if (payload.Log) cb({ type: 'log', data: normalizeLog(payload.Log) });
      else if (payload.Done) cb({ type: 'done', data: normalizeDone(payload.Done) });
      else if (payload.Error) cb({ type: 'error', data: normalizeError(payload.Error) });
    });
  },
};

export default renderAPI;
export { isTauri, isElectron };
