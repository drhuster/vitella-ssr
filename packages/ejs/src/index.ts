import type { Adapter } from '@vitella-ssr/core'
import { renderEjsTemplate } from './renderer.js'

export { ejsVitePlugin } from './vite-plugin.js'

export const ejsAdapter: Adapter = {
  name: 'ejs',
  extensions: ['.ejs'],
  render: async ({ component, loadData, layout }) => {
    return renderEjsTemplate(component, loadData, layout)
  },
  getClientEntry() {
    return `const __initState = window.__INITIAL_STATE__ || {}`
  },
}
