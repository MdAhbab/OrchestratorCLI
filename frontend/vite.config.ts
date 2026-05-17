import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const backendTarget = process.env.VITE_BACKEND_TARGET || 'http://127.0.0.1:8000'
const apiBase = process.env.VITE_API_BASE || '/api'
const normalizedApiBaseRaw = apiBase.startsWith('/') ? apiBase : `/${apiBase}`
const normalizedApiBase = normalizedApiBaseRaw.endsWith('/') && normalizedApiBaseRaw.length > 1
  ? normalizedApiBaseRaw.slice(0, -1)
  : normalizedApiBaseRaw

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      [normalizedApiBase]: {
        target: backendTarget,
        changeOrigin: true,
      },
      '/health': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/ws': {
        target: backendTarget.replace(/^http/, 'ws'),
        ws: true,
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
