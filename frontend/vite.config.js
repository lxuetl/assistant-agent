import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:8000'

  return {
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
          // 默认代理到本地 FastAPI，必要时可通过环境变量覆盖
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        }
      }
    }
  }
})