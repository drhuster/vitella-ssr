import { defineConfig } from 'vite'
import { vitellaPlugin } from '@vitella-ssr/core'
import { ejsAdapter, ejsVitePlugin } from '@vitella-ssr/ejs'

export default defineConfig({
  plugins: [
    ejsVitePlugin(),
    vitellaPlugin({ adapter: ejsAdapter }),
  ],
  build: {
    outDir: 'dist',
  },
})
