import { defineConfig, searchForWorkspaceRoot } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the build works at https://<user>.github.io/<repo>/
// without hard-coding the repo name. Routing uses HashRouter for the same reason.
export default defineConfig({
  plugins: [react()],
  base: './',
  // The Demo Users page reads the backend's seed file directly, so the docs can't drift from the demo.
  server: {
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), '../backend/internal/store/demo-users.json'] },
  },
})
