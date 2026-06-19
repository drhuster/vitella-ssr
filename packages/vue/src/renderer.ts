import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import type { AdapterRenderResult } from '@vitella-ssr/core'

export async function renderVueComponent(
  component: any,
  loadData: Record<string, unknown>
): Promise<string | AdapterRenderResult> {
  const ssrContext: { head?: { title?: string; meta?: Array<any>; link?: Array<any> } } = {}

  const app = createSSRApp({
    render() {
      return h(component, loadData)
    },
  })

  app.provide('ssrContext', ssrContext)

  const html = await renderToString(app, ssrContext)

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
}
