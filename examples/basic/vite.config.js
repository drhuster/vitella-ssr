import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { vitellaPlugin } from '@vitella-ssr/core'
import { vueAdapter } from '@vitella-ssr/vue'

const piniaVueAdapter = {
  ...vueAdapter,

  render: async ({ component, loadData, layout }) => {
    const { createSSRApp, h } = await import('vue')
    const { renderToString } = await import('@vue/server-renderer')
    const { createPinia } = await import('pinia')

    const ssrContext = {}
    const app = createSSRApp({
      render() {
        if (layout) {
          return h(layout, null, { default: () => h(component, loadData) })
        }
        return h(component, loadData)
      },
    })
    app.use(createPinia())
    const html = await renderToString(app, ssrContext)

    const headData = ssrContext.head
    if (!headData) return html

    let head = ''
    if (headData.meta) {
      head += headData.meta
        .map((m) =>
          `<meta${m.charset ? ` charset="${m.charset}"` : ''}${m.name ? ` name="${m.name}"` : ''}${m.property ? ` property="${m.property}"` : ''}${m.content ? ` content="${m.content}"` : ''}>`
        )
        .join('\n  ')
    }
    if (headData.link) {
      head += headData.link
        .map((l) => `<link rel="${l.rel}" href="${l.href}">`)
        .join('\n  ')
    }

    return { html, title: headData.title, head: head || undefined }
  },

  getClientEntry(page, pagePath, layout) {
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

export default defineConfig({
  plugins: [vue(), vitellaPlugin({
    adapter: piniaVueAdapter,
    appShell: 'src/app.html',
    middleware: [
      async (req, res, next) => {
        console.log(`[${req.method}] ${req.url}`)
        next()
      },
    ],
  })],
  build: {
    outDir: 'dist',
  },
})
