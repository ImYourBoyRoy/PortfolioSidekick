import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    proxy: {
      '/robinhood-api': {
        target: 'https://api.robinhood.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/robinhood-api/, ''),
      },
    },
  },
})
