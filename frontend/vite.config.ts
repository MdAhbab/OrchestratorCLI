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

const backendProxy = {
  target: backendTarget,
  changeOrigin: true,
  configure(proxy: any) {
    proxy.on('error', (err: any, _req: any, res: any) => {
      const message = err?.code || err?.message || 'backend unavailable'
      console.warn(`[vite] backend proxy unavailable: ${message}`)
      if (res && !res.headersSent) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ detail: 'Backend is starting or unavailable' }))
      }
    })
  },
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      [normalizedApiBase]: backendProxy,
      '/health': backendProxy,
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
