import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: 'ws://localhost:8000/ws/robot/status',   // 目标服务器地址（后端真实地址）
        changeOrigin: true,   // 是否修改请求头中的Host值（建议开启）。开启后请求头Host会变成target的域名
        rewrite: (path) => (path) // 重写路径（可选）
      }
    }
  }
})

