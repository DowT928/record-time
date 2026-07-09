import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import { esmShim, notBundle } from 'vite-plugin-electron/plugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          plugins: [notBundle(), esmShim()],
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          plugins: [esmShim()],
        },
      },
      renderer: {},
    }),
  ],
})
