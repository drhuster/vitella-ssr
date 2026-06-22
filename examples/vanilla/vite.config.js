import { defineConfig } from 'vite'
import { vitellaPlugin } from '@vitella-ssr/core'

export default defineConfig({
  plugins: [vitellaPlugin({
    appShell: 'src/app.html',
    adapter: {
      name: 'vanilla',
      extensions: ['.js', '.ts'],
      render: async ({ component, loadData, layout }) => {
        const html = component(loadData)
        if (layout) {
          return layout({ children: html, ...loadData })
        }
        return html
      },
    },
  })],
  build: {
    outDir: 'dist',
  },
})
