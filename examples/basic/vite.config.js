import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { vitellaPlugin } from '@vitella-ssr/core'
import { vueAdapter } from '@vitella-ssr/vue'

export default defineConfig({
  plugins: [vue(), vitellaPlugin({
    adapter: vueAdapter,
    appShell: 'src/app.html',
    middleware: [
      async (req, res, next) => {
        console.log(`[${req.method}] ${req.url}`)
        next()
      },
    ],
  })],
  build: {
    outDir: 'dist',
  },
})
