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
  },
})
