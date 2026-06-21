import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import type { AdapterRenderResult } from '@vitella-ssr/core'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function renderVueComponent(
  component: any,
  loadData: Record<string, unknown>,
  layout?: any
): Promise<string | AdapterRenderResult> {
  const ssrContext: { head?: { title?: string; meta?: Array<any>; link?: Array<any> } } = {}

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

  const html = await renderToString(app, ssrContext)

  const headData = ssrContext.head
  if (!headData) return html

  let head = ''
  if (headData.meta) {
    head += headData.meta
      .map((m: any) =>
        `<meta${m.charset ? ` charset="${escapeHtml(m.charset)}"` : ''}${m.name ? ` name="${escapeHtml(m.name)}"` : ''}${m.property ? ` property="${escapeHtml(m.property)}"` : ''}${m.content ? ` content="${escapeHtml(m.content)}"` : ''}>`
      )
      .join('\n  ')
  }
  if (headData.link) {
    head += headData.link
      .map((l: any) => `<link rel="${escapeHtml(l.rel)}" href="${escapeHtml(l.href)}">`)
      .join('\n  ')
  }

  return {
    html,
    title: headData.title,
    head: head || undefined,
  }
}
