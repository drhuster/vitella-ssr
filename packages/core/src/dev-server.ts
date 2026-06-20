import type { ViteDevServer } from 'vite'
import { IncomingMessage, ServerResponse } from 'http'
import { buildRouteManifest } from './route-manifest.js'
import { matchRoute } from './route-matcher.js'
import { runMiddleware } from './middleware-chain.js'
import { loadHtmlShell, renderHtmlShell } from './html-shell.js'
import type { ResolvedVitellaConfig } from './config.js'
import type { AdapterRenderResult, ApiHandlerModule, Route } from './types.js'
import { parseRequestContext, flushCookies, type RequestContext } from './request-context.js'
import { resolve as resolvePath } from 'path'

export interface DevServerState {
  manifest: ReturnType<typeof buildRouteManifest>
  config: ResolvedVitellaConfig
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
  const ctx: RequestContext = parseRequestContext(req, params)

  if (!handler) {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    flushCookies(res, ctx.cookies)
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const result = await handler(req, res, ctx)
  res.statusCode = result.status || 200
  res.setHeader('Content-Type', 'application/json')
  flushCookies(res, ctx.cookies)
  res.end(JSON.stringify(result.body))
}

async function handlePageRoute(
  route: Route,
  params: Record<string, string>,
  req: IncomingMessage,
  res: ServerResponse,
  vite: ViteDevServer,
  state: DevServerState
): Promise<void> {
  const { config } = state
  const mod = await vite.ssrLoadModule(route.filePath)
  const loadData: Record<string, unknown> = {}
  let pageTtl: number | undefined = undefined
  const ctx: RequestContext = parseRequestContext(req, params)

  function mergeLoadResult(result: Record<string, unknown> | undefined) {
    if (!result) return
    if (result.ttl !== undefined) pageTtl = result.ttl as number
    const { ttl, ...rest } = result
    Object.assign(loadData, rest)
  }

  let layoutComponent: any = undefined
  if (route.layout) {
    const layoutMod = await vite.ssrLoadModule(route.layout)
    if (typeof layoutMod.load === 'function') {
      const result = await layoutMod.load({ req, ...ctx })
      mergeLoadResult(result)
    }
    layoutComponent = layoutMod.default
  }

  if (typeof mod.load === 'function') {
    const result = await mod.load({ req, ...ctx })
    mergeLoadResult(result)
  }

  if (!config.adapter) {
    flushCookies(res, ctx.cookies)
    res.setHeader('Content-Type', 'text/html')
    const template = loadHtmlShell(resolvePath(vite.config.root, config.appShell))
    res.end(renderHtmlShell(template, { html: '<div>No adapter configured</div>' }))
    return
  }

  const component = mod.default
  const raw = await config.adapter.render({
    page: route.filePath,
    component,
    layout: layoutComponent,
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

  const finalTtl = pageTtl ?? config.ttl?.pages
  if (finalTtl && finalTtl > 0) {
    res.setHeader('Cache-Control', `public, max-age=${finalTtl}`)
  }

  flushCookies(res, ctx.cookies)
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
