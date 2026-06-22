import type { AdapterRenderResult } from '@vitella-ssr/core'

export async function renderEjsTemplate(
  component: (locals: Record<string, unknown>) => string,
  loadData: Record<string, unknown>,
  layout?: (locals: Record<string, unknown>) => string,
): Promise<AdapterRenderResult> {
  const html = component(loadData)
  if (layout) {
    const layoutHtml = layout({ ...loadData, content: html })
    return { html: layoutHtml }
  }
  return { html }
}
