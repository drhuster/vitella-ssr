import type { ViteDevServer } from 'vite'
import { IncomingMessage, ServerResponse } from 'http'
import { buildRouteManifest } from './route-manifest.js'
import { matchRoute } from './route-matcher.js'
import { runMiddleware } from './middleware-chain.js'
import { loadHtmlShell, renderHtmlShell } from './html-shell.js'
import type { ResolvedVitellaConfig } from './config.js'
import type { AdapterRenderResult, ApiHandlerModule } from './types.js'
import { resolve as resolvePath } from 'path'

export interface DevServerState {
  manifest: ReturnType<typeof buildRouteManifest>
  config: ResolvedVitellaConfig
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  const cookie = req.headers.cookie
  if (!cookie) return {}
  return Object.fromEntries(
    cookie.split(';').map(c => {
      const idx = c.indexOf('=')
      if (idx === -1) return [c.trim(), '']
      return [c.slice(0, idx).trim(), c.slice(idx + 1).trim()]
    })
  )
}

function isStructuredResult(result: any): result is AdapterRenderResult {
  return typeof result === 'object' && result !== null && typeof result.html === 'string'
}

function virtualClientUrl(pagePath: string): string {
  return `/@id/__x00__vitella:client-entry:${pagePath}`
}

export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  vite: ViteDevServer,
  state: DevServerState
): Promise<void> {
  const url = req.url || '/'
  const { manifest, config } = state

  await runMiddleware(config.middleware, req, res, async (req, res) => {
    // Try matching API routes first
    const apiMatch = matchRoute(url, manifest.apis)
    if (apiMatch) {
      await handleApiRoute(apiMatch.route, apiMatch.params, req, res, vite)
      return
    }

    // Then try page routes
    const pageMatch = matchRoute(url, manifest.pages)
    if (pageMatch) {
      await handlePageRoute(pageMatch.route, pageMatch.params, req, res, vite, state)
      return
    }

    // No match
    res.statusCode = 404
    res.end('Not Found')
  })
}

async function handleApiRoute(
  route: { filePath: string },
  params: Record<string, string>,
  req: IncomingMessage,
  res: ServerResponse,
  vite: ViteDevServer
): Promise<void> {
  const mod = await vite.ssrLoadModule(route.filePath)
  const method = (req.method || 'GET').toLowerCase() as keyof ApiHandlerModule
  const handler = mod[method] || mod['get']

  if (!handler) {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const result = await handler(req, res, params)
  res.statusCode = result.status || 200
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(result.body))
}

async function handlePageRoute(
  route: { filePath: string },
  params: Record<string, string>,
  req: IncomingMessage,
  res: ServerResponse,
  vite: ViteDevServer,
  state: DevServerState
): Promise<void> {
  const { config } = state
  const mod = await vite.ssrLoadModule(route.filePath)
  const loadData: Record<string, unknown> = {}

  if (typeof mod.load === 'function') {
    const url = req.url || '/'
    const queryStr = url.includes('?') ? url.split('?')[1] : ''
    const query = Object.fromEntries(new URLSearchParams(queryStr))
    const result = await mod.load({ params, query, cookies: parseCookies(req) })
    Object.assign(loadData, result)
  }

  if (!config.adapter) {
    res.setHeader('Content-Type', 'text/html')
    const template = loadHtmlShell(resolvePath(vite.config.root, config.appShell))
    res.end(renderHtmlShell(template, { html: '<div>No adapter configured</div>' }))
    return
  }

  const component = mod.default
  const raw = await config.adapter.render({
    page: route.filePath,
    component,
    loadData,
    req,
    res,
  })

  const html = isStructuredResult(raw) ? raw.html : raw
  const title = isStructuredResult(raw) ? raw.title : undefined
  const head = isStructuredResult(raw) ? raw.head : undefined

  const scriptUrl = config.adapter.getClientEntry
    ? virtualClientUrl(route.filePath)
    : undefined

  const template = loadHtmlShell(resolvePath(vite.config.root, config.appShell))
  const fullHtml = renderHtmlShell(template, {
    html,
    title,
    head,
    state: Object.keys(loadData).length > 0 ? loadData : undefined,
    scripts: scriptUrl ? [scriptUrl] : undefined,
  })

  res.setHeader('Content-Type', 'text/html')
  res.end(fullHtml)
}
