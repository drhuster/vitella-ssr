import type { Adapter } from '@vitella-ssr/core'
import { vueAdapter } from '@vitella-ssr/vue'
import { createPiniaSSR } from './server.js'

export const piniaVueAdapter: Adapter = {
  ...vueAdapter,
  name: 'pinia-vue',

  render: async ({ component, loadData, layout }) => {
    const { createSSRApp, h } = await import('vue')
    const { renderToString } = await import('@vue/server-renderer')

    const ssrContext: {
      head?: { title?: string; meta?: Array<any>; link?: Array<any> }
    } = {}
    const { pinia, serialize } = createPiniaSSR()

    const app = createSSRApp({
      render() {
        if (layout) {
          return h(layout, null, {
            default: () => h(component, loadData),
          })
        }
        return h(component, loadData)
      },
    })

    app.use(pinia)

    const html = await renderToString(app, ssrContext)

    const piniaState = serialize()
    if (Object.keys(piniaState).length > 0) {
      loadData.pinia = piniaState
    }

    const headData = ssrContext.head
    if (!headData) return html

    let head = ''
    if (headData.meta) {
      head += headData.meta
        .map((m: any) =>
          `<meta${m.charset ? ` charset="${m.charset}"` : ''}${m.name ? ` name="${m.name}"` : ''}${m.property ? ` property="${m.property}"` : ''}${m.content ? ` content="${m.content}"` : ''}>`
        )
        .join('\n  ')
    }
    if (headData.link) {
      head += headData.link
        .map((l: any) => `<link rel="${l.rel}" href="${l.href}">`)
        .join('\n  ')
    }

    return {
      html,
      title: headData.title,
      head: head || undefined,
    }
  },

  getClientEntry(page: string, pagePath: string, layout?: string): string {
    if (layout) {
      return [
        `import { createSSRApp, h } from 'vue'`,
        `import { hydratePinia } from '@vitella-ssr/pinia'`,
        `import Layout from ${JSON.stringify(layout)}`,
        `import Page from ${JSON.stringify(pagePath)}`,
        `const __initState = typeof window !== 'undefined' ? window.__INITIAL_STATE__ || {} : {}`,
        `const pinia = hydratePinia()`,
        `const app = createSSRApp({ render() { return h(Layout, null, { default: () => h(Page, __initState) }) } })`,
        `app.use(pinia)`,
        `app.mount('#app')`,
      ].join('\n')
    }
    return [
      `import { createSSRApp } from 'vue'`,
      `import { hydratePinia } from '@vitella-ssr/pinia'`,
      `import Page from ${JSON.stringify(pagePath)}`,
      `const __initState = typeof window !== 'undefined' ? window.__INITIAL_STATE__ || {} : {}`,
      `const pinia = hydratePinia()`,
      `const app = createSSRApp(Page, __initState)`,
      `app.use(pinia)`,
      `app.mount('#app')`,
    ].join('\n')
  },
}
