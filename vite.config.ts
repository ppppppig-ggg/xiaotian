import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // 后端 Express 默认跑在 8787，可用 SERVER_PORT 改端口；前端统一走 /api。
      '/api': {
        target: `http://localhost:${process.env.SERVER_PORT ?? '8787'}`,
        changeOrigin: true,
      },
    },
  },
})
