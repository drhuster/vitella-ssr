import type { ViteDevServer } from 'vite'
import { IncomingMessage, ServerResponse } from 'http'
import { buildRouteManifest } from './route-manifest.js'
import { matchRoute } from './route-matcher.js'
import { runMiddleware } from './middleware-chain.js'
import { loadHtmlShell, renderHtmlShell, renderDefaultErrorPage } from './html-shell.js'
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

const MAX_BODY_SIZE = 10 * 1024 * 1024

export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  vite: ViteDevServer,
  state: DevServerState
): Promise<void> {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10)
  if (contentLength > MAX_BODY_SIZE) {
    res.statusCode = 413
    res.end('Request Entity Too Large')
    return
  }

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
    await handleErrorPage(404, 'Not Found', req, res, vite, state)
    return
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

async function handleErrorPage(
  statusCode: number,
  statusMessage: string,
  req: IncomingMessage,
  res: ServerResponse,
  vite: ViteDevServer,
  state: DevServerState
): Promise<void> {
  const { manifest, config } = state
  const errUrl = req.url || '/'

  if (config.adapter && manifest.errorPage) {
    res.statusCode = statusCode
    try {
      const mod = await vite.ssrLoadModule(manifest.errorPage.filePath)
      const loadData: Record<string, unknown> = {
        statusCode,
        statusMessage,
        url: errUrl,
      }

      const ctx = parseRequestContext(req, {})

      let layoutComponent: any = undefined
      if (manifest.errorPage.layout) {
        const layoutMod = await vite.ssrLoadModule(manifest.errorPage.layout)
        if (typeof layoutMod.load === 'function') {
          await layoutMod.load({ req, ...ctx })
        }
        layoutComponent = layoutMod.default
      }

      const component = mod.default
      const raw = await config.adapter.render({
        page: manifest.errorPage.filePath,
        component,
        layout: layoutComponent,
        loadData,
        req,
        res,
      })

      const resultData = isStructuredResult(raw)
      const html = resultData ? raw.html : raw
      const title = resultData ? raw.title : undefined
      const head = resultData ? raw.head : undefined

      const scriptUrl = config.adapter.getClientEntry
        ? virtualClientUrl(manifest.errorPage.filePath)
        : undefined

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
      return
    } catch (e) {
      console.error('Error rendering error page:', e)
    }
  }

  res.statusCode = statusCode
  res.setHeader('Content-Type', 'text/html')
  res.end(renderDefaultErrorPage(statusCode, statusMessage, errUrl))
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
    const { ttl, __proto__, constructor, prototype, ...rest } = result
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

  try {
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

    const resultData = isStructuredResult(raw)
    const html = resultData ? raw.html : raw
    const title = resultData ? raw.title : undefined
    const head = resultData ? raw.head : undefined

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
  } catch (e) {
    console.error('Error rendering page:', e)
    await handleErrorPage(500, 'Internal Server Error', req, res, vite, state)
  }
}
