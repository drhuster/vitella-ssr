import type { ViteDevServer, ModuleNode } from 'vite'
import { IncomingMessage, ServerResponse } from 'http'
import { promisify } from 'util'
import { brotliCompress as brotliCompressCb, gzip as gzipCb, deflate as deflateCb } from 'zlib'
import { buildRouteManifest } from './route-manifest.js'
import { matchRoute } from './route-matcher.js'
import { runMiddleware } from './middleware-chain.js'
import { loadHtmlShell, renderHtmlShell, renderDefaultErrorPage } from './html-shell.js'
import type { ResolvedVitellaConfig } from './config.js'
import type { AdapterRenderResult, ApiHandlerModule, Route } from './types.js'
import { parseRequestContext, flushCookies, type RequestContext } from './request-context.js'
import { resolve as resolvePath, relative } from 'path'

const brotliCompress = promisify(brotliCompressCb)
const gzip = promisify(gzipCb)
const deflate = promisify(deflateCb)

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

function setSecurityHeaders(res: ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Strict-Transport-Security', 'max-age=31536000')
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '))
}

async function compressAndEnd(res: ServerResponse, data: string, contentType: string, req: IncomingMessage): Promise<void> {
  res.setHeader('Content-Type', contentType)
  const accept = req.headers['accept-encoding'] || ''
  try {
    const buffer = Buffer.from(data, 'utf-8')
    let compressed: Buffer
    if (accept.includes('br')) {
      compressed = await brotliCompress(buffer)
      res.setHeader('Content-Encoding', 'br')
    } else if (accept.includes('gzip')) {
      compressed = await gzip(buffer)
      res.setHeader('Content-Encoding', 'gzip')
    } else if (accept.includes('deflate')) {
      compressed = await deflate(buffer)
      res.setHeader('Content-Encoding', 'deflate')
    } else {
      res.end(data)
      return
    }
    res.removeHeader('Content-Length')
    res.end(compressed)
  } catch {
    res.end(data)
  }
}

async function sendJson(res: ServerResponse, data: unknown, req: IncomingMessage): Promise<void> {
  await compressAndEnd(res, JSON.stringify(data), 'application/json', req)
}

async function sendHtml(res: ServerResponse, html: string, req: IncomingMessage): Promise<void> {
  await compressAndEnd(res, html, 'text/html', req)
}

const MAX_TTL = 31536000

function sanitizeTtl(ttl: unknown): number | undefined {
  if (typeof ttl === 'number' && Number.isFinite(ttl) && ttl > 0 && ttl <= MAX_TTL) {
    return Math.floor(ttl)
  }
  return undefined
}

function collectCssUrls(vite: ViteDevServer, filePath: string): string[] {
  if (!vite.moduleGraph) return []

  const root = vite.config.root || process.cwd()
  const relativePath = '/' + relative(root, filePath)
  const mod = vite.moduleGraph.urlToModuleMap.get(relativePath)
  if (!mod) return []

  const cssUrls = new Set<string>()
  const visited = new Set<string>()

  function walk(node: ModuleNode) {
    if (visited.has(node.url)) return
    visited.add(node.url)

    if (node.url.includes('type=style') || node.url.endsWith('.css')) {
      cssUrls.add(node.url)
    }

    for (const imported of node.importedModules) {
      walk(imported)
    }
  }

  walk(mod)
  return [...cssUrls]
}


export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  vite: ViteDevServer,
  state: DevServerState
): Promise<void> {
  setSecurityHeaders(res)

  const contentLength = parseInt(req.headers['content-length'] || '0', 10)
  if (contentLength > MAX_BODY_SIZE) {
    res.statusCode = 413
    await compressAndEnd(res, 'Request Entity Too Large', 'text/plain', req)
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
    flushCookies(res, ctx.cookies)
    await sendJson(res, { error: 'Method not allowed' }, req)
    return
  }

  const result = await handler(req, res, ctx)
  res.statusCode = result.status || 200
  flushCookies(res, ctx.cookies)
  await sendJson(res, result.body, req)
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
      let head = resultData ? raw.head : undefined

      const cssUrls = new Set<string>()
      for (const url of collectCssUrls(vite, manifest.errorPage.filePath)) {
        cssUrls.add(url)
      }
      if (manifest.errorPage.layout) {
        for (const url of collectCssUrls(vite, manifest.errorPage.layout)) {
          cssUrls.add(url)
        }
      }
      if (cssUrls.size > 0) {
        const cssLinks = [...cssUrls].map(u => `<link rel="stylesheet" href="${u}">`).join('\n  ')
        head = head ? head + '\n  ' + cssLinks : cssLinks
      }

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
      await sendHtml(res, fullHtml, req)
      return
    } catch (e) {
      console.error('Error rendering error page:', e)
    }
  }

  res.statusCode = statusCode
  await sendHtml(res, renderDefaultErrorPage(statusCode, statusMessage, errUrl), req)
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
    for (const key of Object.keys(result)) {
      if (key === 'ttl' || key === '__proto__' || key === 'constructor' || key === 'prototype') continue
      const desc = Object.getOwnPropertyDescriptor(result, key)
      if (desc && desc.enumerable) {
        loadData[key] = result[key]
      }
    }
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
      const template = loadHtmlShell(resolvePath(vite.config.root, config.appShell))
      await sendHtml(res, renderHtmlShell(template, { html: '<div>No adapter configured</div>' }), req)
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
    let head = resultData ? raw.head : undefined

    // Collect CSS from Vite's module graph and inject as <link> tags.
    // Prevents CLS by loading SFC scoped CSS upfront instead of via JS after hydration.
    const cssUrls = new Set<string>()
    for (const url of collectCssUrls(vite, route.filePath)) {
      cssUrls.add(url)
    }
    if (route.layout) {
      for (const url of collectCssUrls(vite, route.layout)) {
        cssUrls.add(url)
      }
    }
    if (cssUrls.size > 0) {
      const cssLinks = [...cssUrls].map(u => `<link rel="stylesheet" href="${u}">`).join('\n  ')
      head = head ? head + '\n  ' + cssLinks : cssLinks
    }

    const scriptUrl = config.adapter.getClientEntry
      ? virtualClientUrl(route.filePath)
      : undefined

    const finalTtl = sanitizeTtl(pageTtl ?? config.ttl?.pages)
    if (finalTtl !== undefined && finalTtl > 0) {
      res.setHeader('Cache-Control', `public, max-age=${finalTtl}`)
    }

    flushCookies(res, ctx.cookies)
    const template = loadHtmlShell(resolvePath(vite.config.root, config.appShell))
    let fullHtml = renderHtmlShell(template, {
      html,
      title,
      head,
      state: Object.keys(loadData).length > 0 ? loadData : undefined,
      scripts: scriptUrl ? [scriptUrl] : undefined,
    })

    // Let Vite inject the client runtime and any remaining transforms
    try {
      fullHtml = await vite.transformIndexHtml(req.url || '/', fullHtml)
    } catch {
      // If transformIndexHtml fails, fall back to untransformed HTML
    }

    await sendHtml(res, fullHtml, req)
  } catch (e) {
    console.error('Error rendering page:', e)
    await handleErrorPage(500, 'Internal Server Error', req, res, vite, state)
  }
}
