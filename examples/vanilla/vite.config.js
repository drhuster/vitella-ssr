import { defineConfig } from 'vite'
import { vitellaPlugin } from '@vitella-ssr/core'

export default defineConfig({
  plugins: [vitellaPlugin({
    appShell: 'src/app.html',
    adapter: {
      name: 'vanilla',
      extensions: ['.js', '.ts'],
      render: async ({ component, loadData }) => {
        return component(loadData)
      },
    },
  })],
  build: {
    outDir: 'dist',
  },
})
