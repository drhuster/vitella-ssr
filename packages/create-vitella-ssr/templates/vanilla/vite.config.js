import { defineConfig } from 'vite'
import { vitellaPlugin } from '@vitella-ssr/core'

export default defineConfig({
  plugins: [vitellaPlugin({
    appShell: 'src/app.html',
    adapter: {
      name: 'vanilla',
      extensions: ['.js'],
      render: async ({ component, loadData }) => {
        const html = typeof component === 'function'
          ? component(loadData)
          : String(component)
        return { html }
      },
    },
  })],
})
