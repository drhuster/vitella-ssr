import type { Adapter } from '@vitella-ssr/core'
import { renderVueComponent } from './renderer.js'

export { useHead } from './use-head.js'

export const vueAdapter: Adapter = {
  name: 'vue',
  extensions: ['.vue'],
  render: async ({ component, loadData, layout }) => {
    return renderVueComponent(component, loadData, layout)
  },
  getClientEntry(page: string, pagePath: string, layout?: string): string {
    if (layout) {
      return [
        `import { createSSRApp, h } from 'vue'`,
        `import Layout from ${JSON.stringify(layout)}`,
        `import Page from ${JSON.stringify(pagePath)}`,
        `const __initState = typeof window !== 'undefined' ? window.__INITIAL_STATE__ || {} : {}`,
        `const app = createSSRApp({ render() { return h(Layout, null, { default: () => h(Page, __initState) }) } })`,
        `app.mount('#app')`,
      ].join('\n')
    }
    return [
      `import { createSSRApp } from 'vue'`,
      `import Page from ${JSON.stringify(pagePath)}`,
      `const __initState = typeof window !== 'undefined' ? window.__INITIAL_STATE__ || {} : {}`,
      `const app = createSSRApp(Page, __initState)`,
      `app.mount('#app')`,
    ].join('\n')
  },
}
