import type { Adapter } from '@vitella-ssr/core'
import { renderVueComponent } from './renderer.js'

export { useHead } from './use-head.js'

export const vueAdapter: Adapter = {
  name: 'vue',
  extensions: ['.vue'],
  render: async ({ component, loadData }) => {
    return renderVueComponent(component, loadData)
  },
  getClientEntry(page: string, pagePath: string): string {
    return [
      `import { createSSRApp } from 'vue'`,
      `import Page from ${JSON.stringify(pagePath)}`,
      `const __initState = typeof window !== 'undefined' ? window.__INITIAL_STATE__ || {} : {}`,
      `const app = createSSRApp(Page, __initState)`,
      `app.mount('#app')`,
    ].join('\n')
  },
}
