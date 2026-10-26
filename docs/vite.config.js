import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the build works at https://<user>.github.io/<repo>/
// without hard-coding the repo name. Routing uses HashRouter for the same reason.
export default defineConfig({
  plugins: [react()],
  base: './',
})
