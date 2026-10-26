import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev mode: Vite serves the app on :5180 and proxies /api to the Go backend on :8080,
// so the browser sees one origin, the same as behind nginx in integration mode.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180, // distinct from the docs site (5173) so both can run at once
    strictPort: true,
    proxy: {
      '/api': process.env.API_URL ?? 'http://localhost:8080',
    },
  },
})
