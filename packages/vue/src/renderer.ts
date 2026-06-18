import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'

export async function renderVueComponent(component: any, loadData: Record<string, unknown>): Promise<string> {
  const app = createSSRApp({
    render() {
      return h(component, loadData)
    },
  })

  const html = await renderToString(app)
  return html
}
