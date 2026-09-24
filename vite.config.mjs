import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Cấu hình Vite cho Electron renderer
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // ES module output — bắt buộc cho code-splitting (JASSUB web worker)
    rollupOptions: { output: { format: 'es' } },
  },
  worker: {
    // Worker cũng phải ES (JASSUB worker dùng code-splitting, iife không hỗ trợ)
    format: 'es',
  },
})
