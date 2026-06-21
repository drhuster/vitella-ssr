/**
 * Vue 3 adapter for Vitella SSR.
 *
 * Implements the Adapter interface for Vue 3 single-file components (.vue).
 * Handles SSR rendering (with optional layout wrapping) and generates
 * client-side hydration JavaScript that creates and mounts a Vue SSR app.
 */

import type { Adapter } from '@vitella-ssr/core'
import { renderVueComponent } from './renderer.js'

export { useHead } from './use-head.js'

export const vueAdapter: Adapter = {
  name: 'vue',
  extensions: ['.vue'],
  render: async ({ component, loadData, layout }) => {
    return renderVueComponent(component, loadData, layout)
  },
  /** Generate JavaScript code for client-side hydration — imports the page (and optional layout), creates an SSR app, mounts it. */
  getClientEntry(page: string, pagePath: string, layout?: string): string {
    if (!/^[a-zA-Z0-9_./@[\]-]+$/.test(pagePath)) {
      throw new Error(`Invalid pagePath: ${pagePath}`)
    }
    if (layout && !/^[a-zA-Z0-9_./@[\]-]+$/.test(layout)) {
      throw new Error(`Invalid layout: ${layout}`)
    }
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
