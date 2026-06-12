import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    // Tauri/Capacitor ship a single app bundle; serverless engine is intentionally in the main chunk.
    chunkSizeWarningLimit: 700,
  },
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
