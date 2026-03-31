import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    // 1. 你写的：允许 cpolar 穿透访问 Vite
    allowedHosts: [
      '.cpolar.cn',
      '.cpolar.top'
    ],
    // 2. 👇 核心追加：Vite 的内置“迷你 Nginx”代理转发
    proxy: {
      '/api': {
        // 目标指向你的 FastAPI 后端
        // 因为都在 docker-compose 里，直接用服务名 backend 呼叫！
        target: 'http://backend:8000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})