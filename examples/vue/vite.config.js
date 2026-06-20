import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { vitellaPlugin } from '@vitella-ssr/core'
import { piniaVueAdapter } from '@vitella-ssr/pinia'

export default defineConfig({
  plugins: [vue(), vitellaPlugin({
    adapter: piniaVueAdapter,
    appShell: 'src/app.html',
    ttl: {
      images: 86400,  // Cache images for 1 day
    },
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
