import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/ingest': 'http://localhost:8000',
      '/sources': 'http://localhost:8000',
      '/query': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
      '/models': 'http://localhost:8000',
      '/sessions': 'http://localhost:8000',
    },
  },
})
