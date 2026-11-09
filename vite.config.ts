import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // 后端 Express 跑在 8787，前端统一走 /api，避免跨域
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})