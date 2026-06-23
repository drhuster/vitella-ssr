import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { vitellaPlugin } from '@vitella-ssr/core'
import { vueAdapter } from '@vitella-ssr/vue'

export default defineConfig({
  plugins: [vue(), vitellaPlugin({
    appShell: 'src/app.html',
    adapter: vueAdapter,
  })],
})
