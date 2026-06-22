/**
 * Production HTTP server for Vitella SSR.
 *
 * Serves built assets from dist/ with ETag-based caching and on-the-fly
 * compression (brotli/gzip/deflate). Routes API and page requests using
 * the pre-built route manifest, loading SSR entry modules dynamically.
 * Supports the same middleware chain, layout wrapping, data loading,
 * and TTL-based caching as the dev server.
 */

import http, { IncomingMessage, ServerResponse } from 'http'
import fs from 'fs'
import path from 'path'
import { createBrotliCompress, createGzip, createDeflate } from 'zlib'
import { Readable, Writable } from 'stream'
import { matchRoute } from './route-matcher.js'
import { runMiddleware } from './middleware-chain.js'
import { loadHtmlShell, renderHtmlShell, renderDefaultErrorPage } from './html-shell.js'
import { sendShellResponse } from './shell-renderer.js'
import type { AdapterRenderResult, BuildManifest, Route, ApiHandlerModule, ErrorPageInfo } from './types.js'
import type { ResolvedVitellaConfig } from './config.js'
import { parseRequestContext, flushCookies, type RequestContext } from './request-context.js'
import {
  MAX_BODY_SIZE,
  MAX_TTL,
  setSecurityHeaders,
  compressAndEnd,
  sendJson,
  sendHtml,
  isStructuredResult,
  sanitizeTtl,
  mergeLoadResult,
  safeName,
} from './response-utils.js'

/** Serializable route data from the build manifest — rehydrated into full Route objects at runtime. */
interface RouteData {
  path: string
  paramNames: string[]
  type: 'page' | 'api'
  layout?: string
}

/** Reconstruct Route objects from the serialized JSON, regenerating the regex patterns at startup. */
function deserializeRoutes(data: { pages: RouteData[]; apis: RouteData[]; errorPage?: ErrorPageInfo }): { pages: Route[]; apis: Route[] } {
  const toRoute = (r: RouteData): Route => ({
    path: r.path,
    paramNames: r.paramNames,
    type: r.type,
    filePath: '',
    layout: r.layout,
    pattern: new RegExp(
      `^${r.path === '/'
        ? '/'
        : r.path
          .replace(/:([^/]+)/g, '\x00$1\x00')
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\x00([^\x00]+)\x00/g, '([^/]+)')
          .replace(/\/$/, '')
      }(\\?.*)?$`
    ),
  })
  return { pages: data.pages.map(toRoute), apis: data.apis.map(toRoute) }
}

export interface ProdServerOptions {
  distDir: string
  appShell: string
  manifest?: BuildManifest
  routes?: { pages: RouteData[]; apis: RouteData[]; errorPage?: ErrorPageInfo }
  config?: ResolvedVitellaConfig
}

/** Stream a static file with on-the-fly compression based on the request's Accept-Encoding header. */
function sendStaticStream(staticPath: string, mimeType: string, req: IncomingMessage, res: ServerResponse): void {
  res.setHeader('Content-Type', mimeType)
  const accept = req.headers['accept-encoding'] || ''
  const stream = fs.createReadStream(staticPath)
  const streams: (Readable | Writable)[] = [stream]
  const cleanup = () => { for (const s of streams) s.destroy() }

  res.on('close', cleanup)

  stream.on('error', async () => {
    cleanup()
    if (!res.writableEnded) {
      res.statusCode = 500
      await compressAndEnd(res, 'Internal Server Error', 'text/plain', req)
    }
  })

  if (accept.includes('br')) {
    res.setHeader('Content-Encoding', 'br')
    const compress = createBrotliCompress()
    compress.on('error', cleanup)
    streams.push(compress)
    stream.pipe(compress).pipe(res)
  } else if (accept.includes('gzip')) {
    res.setHeader('Content-Encoding', 'gzip')
    const compress = createGzip()
    compress.on('error', cleanup)
    streams.push(compress)
    stream.pipe(compress).pipe(res)
  } else if (accept.includes('deflate')) {
    res.setHeader('Content-Encoding', 'deflate')
    const compress = createDeflate()
    compress.on('error', cleanup)
    streams.push(compress)
    stream.pipe(compress).pipe(res)
  } else {
    stream.pipe(res)
  }
}

/** Create the production HTTP server, loading the build manifest and routes from dist/. */
export async function createProdServer(options: ProdServerOptions): Promise<http.Server> {
  const { distDir, appShell } = options
  const manifestPath = path.join(distDir, 'manifest.json')
  const manifest: BuildManifest = options.manifest || JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  const routesPath = path.join(distDir, 'routes.json')
  const rawRoutes: { pages: RouteData[]; apis: RouteData[]; errorPage?: ErrorPageInfo } = options.routes || (() => {
    try { return JSON.parse(fs.readFileSync(routesPath, 'utf-8')) } catch { return { pages: [], apis: [] } }
  })()
  const routes = deserializeRoutes(rawRoutes)

  let errorFile: string | undefined
  let errorLayout: string | undefined
  if (rawRoutes.errorPage) {
    errorFile = rawRoutes.errorPage.filePath
    errorLayout = rawRoutes.errorPage.layout
  }
  const config = options.config

  const clientDir = path.join(distDir, 'client')

  const mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
    '.map': 'application/json',
  }

  /** Check if a URL targets a static asset (has a recognizable file extension other than .html). */
  function isAssetUrl(url: string): boolean {
    const ext = path.extname(url.split('?')[0])
    return !!ext && ext !== '.html'
  }

  const server = http.createServer(async (req, res) => {
    setSecurityHeaders(res, config?.securityHeaders)

    const contentLength = parseInt(req.headers['content-length'] || '0', 10)
    if (contentLength > MAX_BODY_SIZE) {
      res.statusCode = 413
      await compressAndEnd(res, 'Request Entity Too Large', 'text/plain', req)
      return
    }

    const url = req.url || '/'

    // Try to serve static assets from dist/client before falling through to route matching.
    if (isAssetUrl(url)) {
      const rawPath = path.join(clientDir, url)
      const staticPath = path.resolve(rawPath)
      if (!staticPath.startsWith(path.resolve(clientDir) + path.sep)) {
        res.statusCode = 403
        await compressAndEnd(res, 'Forbidden', 'text/plain', req)
        return
      }
      try {
        const stat = await fs.promises.stat(staticPath)
        if (stat.isFile()) {
          const ext = path.extname(staticPath)
          const mimeType = mimeTypes[ext] || 'application/octet-stream'
          const imageTtl = config?.ttl?.images
          if (imageTtl && imageTtl > 0) {
            res.setHeader('Cache-Control', `public, max-age=${imageTtl}`)
          }
          const etag = `"${stat.mtimeMs}-${stat.size}"`
          if (req.headers['if-none-match'] === etag) {
            res.statusCode = 304
            res.end()
            return
          }
          res.setHeader('ETag', etag)
          sendStaticStream(staticPath, mimeType, req, res)
          return
        }
      } catch {
        // File not found — fall through to route matching
      }
    }

    // Execute middleware chain, then try API matching, page matching, and error page fallback.
    const middleware = config?.middleware || []
    try {
      await runMiddleware(middleware, req, res, async (req, res) => {
        // API route: load the server entry and dispatch to the method handler.
        const apiMatch = matchRoute(url, routes.apis)
        if (apiMatch) {
          const safe = safeName(apiMatch.route.path, 'api')
          const modPath = path.join(distDir, 'server', `${safe}.js`)
          try {
            const mod = await import(modPath)
            const method = (req.method || 'GET').toLowerCase() as keyof ApiHandlerModule
            const handler = mod[method] || mod['get']
            if (handler) {
              const ctx: RequestContext = parseRequestContext(req, apiMatch.params)
              const result = await handler(req, res, ctx)
              res.statusCode = result.status || 200
              flushCookies(res, ctx.cookies)
              await sendJson(res, result.body, req)
              return
            }
          } catch {
            res.statusCode = 500
            await compressAndEnd(res, 'Internal Server Error', 'text/plain', req)
            return
          }
        }

        // Page route: load server entry, execute load functions, render via adapter, serve HTML shell.
        const pageMatch = matchRoute(url, routes.pages)
        if (pageMatch) {
          const safe = safeName(pageMatch.route.path, 'index')
          const modPath = path.join(distDir, 'server', `${safe}.js`)
          try {
            const mod = await import(modPath)
            let html: string

            const entry = manifest.pages[pageMatch.route.path]
            let pageTtl: number | undefined = undefined
            const ctx: RequestContext = parseRequestContext(req, pageMatch.params)
            const loadData: Record<string, unknown> = { ...ctx.params }

            let layoutComponent: any = undefined
            const layoutPath = pageMatch.route.layout
            if (layoutPath) {
              const layoutSafe = safeName(layoutPath.replace(/\.[^/.]+$/, ''), '_layout')
              const layoutModPath = path.join(distDir, 'server', `${layoutSafe}.js`)
              try {
                const layoutMod = await import(layoutModPath)
                if (typeof layoutMod.load === 'function') {
                  const result = await layoutMod.load({ req, ...ctx })
                  const ttl = mergeLoadResult(result, loadData)
                  if (ttl !== undefined) pageTtl = ttl
                }
                layoutComponent = layoutMod.default
              } catch {}
            }

            if (typeof mod.load === 'function') {
              const result = await mod.load({ req, ...ctx })
              const ttl = mergeLoadResult(result, loadData)
              if (ttl !== undefined) pageTtl = ttl
            }

            const finalTtl = sanitizeTtl(pageTtl ?? config?.ttl?.pages)
            if (finalTtl !== undefined && finalTtl > 0) {
              res.setHeader('Cache-Control', `public, max-age=${finalTtl}`)
            }

            if (config?.adapter && mod.default) {
              const raw = await config.adapter.render({
                page: url,
                component: mod.default,
                layout: layoutComponent,
                loadData,
                req,
                res,
              })
              const resultData = isStructuredResult(raw)
              const renderHtml = resultData ? raw.html : raw
              const title = resultData ? raw.title : undefined
              const headParts: string[] = []

              if (resultData && raw.head) {
                headParts.push(raw.head)
              }

              const cssLinks = (entry?.css || [])
                .map((f: string) => `<link rel="stylesheet" href="/${f}">`)
                .join('\n  ')
              if (cssLinks) {
                headParts.push(cssLinks)
              }

              const scripts: string[] = []
              if (config?.adapter?.getClientEntry && entry?.clientEntry) {
                scripts.push(`/${entry.clientEntry}`)
              }

              await sendShellResponse({
                html: renderHtml,
                title,
                head: headParts.length > 0 ? headParts.join('\n  ') : undefined,
                loadData,
                scripts: scripts.length > 0 ? scripts : undefined,
                appShell,
                ctx,
                res,
                req,
              })
              return
            } else if (typeof mod.default === 'function') {
              // No adapter: use the page's default export as a simple render function.
              html = mod.default(loadData)
              if (layoutComponent) {
                html = layoutComponent({ children: html, ...loadData })
              }
            } else {
              html = mod.render ? await mod.render(loadData) : '<div></div>'
            }

            flushCookies(res, ctx.cookies)
            try {
              const template = loadHtmlShell(appShell)
              const fullHtml = renderHtmlShell(template, {
                html,
                state: Object.keys(loadData).length > 0 ? loadData : undefined,
              })
              await sendHtml(res, fullHtml, req)
              return
            } catch {
              await sendHtml(res, html, req)
              return
            }
          } catch (e) {
            console.error('Error rendering page:', e)
            await renderErrorPage(500, 'Internal Server Error', req, res, distDir, manifest, errorFile, errorLayout, config, appShell)
            return
          }
        }

        await renderErrorPage(404, 'Not Found', req, res, distDir, manifest, errorFile, errorLayout, config, appShell)
      })
    } catch (e) {
      console.error('Error handling request:', e)
      if (!res.writableEnded) {
        await renderErrorPage(500, 'Internal Server Error', req, res, distDir, manifest, errorFile, errorLayout, config, appShell)
      }
    }
  })

  // Pre-warm the HTML shell cache so the first request isn't penalized.
  try { loadHtmlShell(appShell) } catch { /* warm cache */ }

  return server
}

/** Render an error page using the custom _error component (if available) or the default fallback. */
async function renderErrorPage(
  statusCode: number,
  statusMessage: string,
  req: IncomingMessage,
  res: ServerResponse,
  distDir: string,
  manifest: BuildManifest,
  errorFile: string | undefined,
  errorLayout: string | undefined,
  config?: ResolvedVitellaConfig,
  appShell?: string
): Promise<void> {
  const errUrl = req.url || '/'

  if (config?.adapter && errorFile) {
    res.statusCode = statusCode
    try {
      const modPath = path.join(distDir, 'server', '_error.js')
      const mod = await import(modPath)
      const loadData: Record<string, unknown> = {
        statusCode,
        statusMessage,
        url: errUrl,
      }

      const ctx = parseRequestContext(req, {})

      let layoutComponent: any = undefined
      if (errorLayout) {
        const layoutSafe = safeName(errorLayout.replace(/\.[^/.]+$/, ''), '_layout')
        const layoutModPath = path.join(distDir, 'server', `${layoutSafe}.js`)
        try {
          const layoutMod = await import(layoutModPath)
          if (typeof layoutMod.load === 'function') {
            const result = await layoutMod.load({ req, ...ctx })
            mergeLoadResult(result, loadData)
          }
          layoutComponent = layoutMod.default
        } catch {}
      }

      const raw = await config.adapter.render({
        page: errorFile,
        component: mod.default,
        layout: layoutComponent,
        loadData,
        req,
        res,
      })

      const resultData = isStructuredResult(raw)
      const html = resultData ? raw.html : raw
      const title = resultData ? raw.title : undefined
      const head = resultData ? raw.head : undefined

      const entry = manifest.pages['__error__']
      const headParts: string[] = []
      if (head) headParts.push(head)
      if (entry?.css) {
        headParts.push(entry.css.map((f: string) => `<link rel="stylesheet" href="/${f}">`).join('\n  '))
      }

      await sendShellResponse({
        html,
        title,
        head: headParts.length > 0 ? headParts.join('\n  ') : undefined,
        loadData,
        appShell: appShell || '',
        ctx,
        res,
        req,
      })
      return
    } catch (e) {
      console.error('Error rendering error page:', e)
    }
  }

  res.statusCode = statusCode
  await compressAndEnd(res, renderDefaultErrorPage(statusCode, statusMessage, errUrl), 'text/html', req)
}
