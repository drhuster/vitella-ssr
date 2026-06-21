import { IncomingMessage, ServerResponse } from 'http'
import type { ViteDevServer } from 'vite'
import { loadHtmlShell, renderHtmlShell } from './html-shell.js'
import { flushCookies } from './request-context.js'
import { sendHtml } from './response-utils.js'
import type { RequestContext } from './types.js'

export interface ShellResponseOptions {
  html: string
  title?: string
  head?: string
  loadData: Record<string, unknown>
  scripts?: string[]
  appShell: string
  ctx: RequestContext
  res: ServerResponse
  req: IncomingMessage
  vite?: ViteDevServer
}

export async function sendShellResponse(options: ShellResponseOptions): Promise<void> {
  const { html, title, head, loadData, scripts, appShell, ctx, res, req, vite } = options

  flushCookies(res, ctx.cookies)
  let fullHtml: string
  try {
    const template = loadHtmlShell(appShell)
    fullHtml = renderHtmlShell(template, {
      html,
      title,
      head,
      state: Object.keys(loadData).length > 0 ? loadData : undefined,
      scripts: scripts && scripts.length > 0 ? scripts : undefined,
    })
  } catch {
    await sendHtml(res, html, req)
    return
  }

  if (vite) {
    try {
      fullHtml = await vite.transformIndexHtml(req.url || '/', fullHtml)
    } catch {
      // fall back to untransformed HTML
    }
  }

  await sendHtml(res, fullHtml, req)
}
