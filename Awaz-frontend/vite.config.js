import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    proxy: {
      '/ws': { target: 'ws://localhost:3000', ws: true },
      '/translate': 'http://localhost:3000',
      '/languages': 'http://localhost:3000',
      '/history': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
      '/meeting': 'http://localhost:3000',
      '/intelligence': 'http://localhost:3000',
    },
  },
})

