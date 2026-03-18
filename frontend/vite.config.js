import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: [
      '.cpolar.cn',
       '4f4c7b4e.r3.cpolar.top'
       // 💡 重点：前面加个英文句号！代表允许所有以 cpolar.cn 结尾的域名
    ]
  }
})