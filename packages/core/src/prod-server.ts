import http, { IncomingMessage, ServerResponse } from 'http'
import fs from 'fs'
import path from 'path'
import { matchRoute } from './route-matcher.js'
import { runMiddleware } from './middleware-chain.js'
import { loadHtmlShell, renderHtmlShell, renderDefaultErrorPage } from './html-shell.js'
import type { AdapterRenderResult, BuildManifest, Route, ApiHandlerModule, ErrorPageInfo } from './types.js'
import type { ResolvedVitellaConfig } from './config.js'
import { parseRequestContext, flushCookies, type RequestContext } from './request-context.js'

interface RouteData {
  path: string
  paramNames: string[]
  type: 'page' | 'api'
  layout?: string
}

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

function isStructuredResult(result: any): result is AdapterRenderResult {
  return typeof result === 'object' && result !== null && typeof result.html === 'string'
}

export interface ProdServerOptions {
  distDir: string
  appShell: string
  manifest?: BuildManifest
  routes?: { pages: RouteData[]; apis: RouteData[]; errorPage?: ErrorPageInfo }
  config?: ResolvedVitellaConfig
}

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

  function isAssetUrl(url: string): boolean {
    const ext = path.extname(url.split('?')[0])
    return !!ext && ext !== '.html'
  }

  const MAX_BODY_SIZE = 10 * 1024 * 1024

  const server = http.createServer(async (req, res) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10)
    if (contentLength > MAX_BODY_SIZE) {
      res.statusCode = 413
      res.end('Request Entity Too Large')
      return
    }

    const url = req.url || '/'

    // Serve static assets immediately (skip route matching)
    if (isAssetUrl(url)) {
      const rawPath = path.join(clientDir, url)
      const staticPath = path.resolve(rawPath)
      if (!staticPath.startsWith(path.resolve(clientDir) + path.sep)) {
        res.statusCode = 403
        res.end('Forbidden')
        return
      }
      try {
        const stat = await fs.promises.stat(staticPath)
        if (stat.isFile()) {
          const ext = path.extname(staticPath)
          res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream')
          const imageTtl = config?.ttl?.images
          if (imageTtl && imageTtl > 0) {
            res.setHeader('Cache-Control', `public, max-age=${imageTtl}`)
          }
          const stream = fs.createReadStream(staticPath)
          stream.on('error', () => {
            res.statusCode = 500
            res.end('Internal Server Error')
          })
          stream.pipe(res)
          return
        }
      } catch {
        // File not found or not accessible — fall through to route matching
      }
    }

    // Run middleware if configured
    const middleware = config?.middleware || []
    try {
      await runMiddleware(middleware, req, res, async (req, res) => {
        // Try API routes first (matchRoute with pattern)
        const apiMatch = matchRoute(url, routes.apis)
        if (apiMatch) {
          const safeName = buildSafeName(apiMatch.route.path, 'api')
          const modPath = path.join(distDir, 'server', `${safeName}.js`)
          try {
            const mod = await import(modPath)
            const method = (req.method || 'GET').toLowerCase() as keyof ApiHandlerModule
            const handler = mod[method] || mod['get']
            if (handler) {
              const ctx: RequestContext = parseRequestContext(req, apiMatch.params)
              const result = await handler(req, res, ctx)
              res.statusCode = result.status || 200
              res.setHeader('Content-Type', 'application/json')
              flushCookies(res, ctx.cookies)
              res.end(JSON.stringify(result.body))
              return
            }
          } catch {
            res.statusCode = 500
            res.end('Internal Server Error')
            return
          }
        }

        // Then try page routes (matchRoute with pattern)
        const pageMatch = matchRoute(url, routes.pages)
        if (pageMatch) {
          const safeName = buildSafeName(pageMatch.route.path, 'index')
          const modPath = path.join(distDir, 'server', `${safeName}.js`)
          try {
            const mod = await import(modPath)
            let html: string

            const entry = manifest.pages[pageMatch.route.path]
            const loadData: Record<string, unknown> = {}
            let pageTtl: number | undefined = undefined

            function mergeLoadResult(result: Record<string, unknown> | undefined) {
              if (!result) return
              if (result.ttl !== undefined) pageTtl = result.ttl as number
              const { ttl, __proto__, constructor, prototype, ...rest } = result
              Object.assign(loadData, rest)
            }

            let layoutComponent: any = undefined
            const layoutPath = pageMatch.route.layout
            const ctx: RequestContext = parseRequestContext(req, pageMatch.params)
            if (layoutPath) {
              const layoutSafeName = layoutPath
                .replace(/\//g, '_')
                .replace(/\.[^/.]+$/, '')
                .replace(/^_/, '') || '_layout'
              const layoutModPath = path.join(distDir, 'server', `${layoutSafeName}.js`)
              try {
                const layoutMod = await import(layoutModPath)
                if (typeof layoutMod.load === 'function') {
                  const result = await layoutMod.load({ req, ...ctx })
                  mergeLoadResult(result)
                }
                layoutComponent = layoutMod.default
              } catch {}
            }

            if (typeof mod.load === 'function') {
              const result = await mod.load({ req, ...ctx })
              mergeLoadResult(result)
            }

            const finalTtl = pageTtl ?? config?.ttl?.pages
            if (finalTtl && finalTtl > 0) {
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
              const html = resultData ? raw.html : raw
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

              try {
                flushCookies(res, ctx.cookies)
                const template = loadHtmlShell(appShell)
                const fullHtml = renderHtmlShell(template, {
                  html,
                  title,
                  head: headParts.length > 0 ? headParts.join('\n  ') : undefined,
                  state: Object.keys(loadData).length > 0 ? loadData : undefined,
                  scripts: scripts.length > 0 ? scripts : undefined,
                })
                res.setHeader('Content-Type', 'text/html')
                res.end(fullHtml)
                return
              } catch {
                res.setHeader('Content-Type', 'text/html')
                res.end(html)
                return
              }
            } else if (typeof mod.default === 'function') {
              html = mod.default(loadData)
            } else {
              html = mod.render ? await mod.render(loadData) : '<div></div>'
            }

            try {
              flushCookies(res, ctx.cookies)
              const template = loadHtmlShell(appShell)
              const fullHtml = renderHtmlShell(template, {
                html,
                state: Object.keys(loadData).length > 0 ? loadData : undefined,
              })
              res.setHeader('Content-Type', 'text/html')
              res.end(fullHtml)
              return
            } catch {
              res.setHeader('Content-Type', 'text/html')
              res.end(html)
              return
            }
          } catch (e) {
            console.error('Error rendering page:', e)
            await renderErrorPage(500, 'Internal Server Error', req, res, distDir, manifest, errorFile, errorLayout, config, appShell)
            return
          }
        }

        await renderErrorPage(404, 'Not Found', req, res, distDir, manifest, errorFile, errorLayout, config, appShell)
        return
      })
    } catch (e) {
      console.error('Error handling request:', e)
      if (!res.writableEnded) {
        await renderErrorPage(500, 'Internal Server Error', req, res, distDir, manifest, errorFile, errorLayout, config, appShell)
      }
    }
  })

  try { loadHtmlShell(appShell) } catch { /* warm cache on first request */ }

  return server
}

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
        const layoutSafeName = errorLayout
          .replace(/\//g, '_')
          .replace(/\.[^/.]+$/, '')
          .replace(/^_/, '') || '_layout'
        const layoutModPath = path.join(distDir, 'server', `${layoutSafeName}.js`)
        try {
          const layoutMod = await import(layoutModPath)
          if (typeof layoutMod.load === 'function') {
            const result = await layoutMod.load({ req, ...ctx })
            if (result) {
              const { ttl: _ttl, __proto__: _p, constructor: _c, prototype: _pt, ...rest } = result
              Object.assign(loadData, rest)
            }
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

      flushCookies(res, ctx.cookies)

      try {
        const template = loadHtmlShell(appShell || '')
        const fullHtml = renderHtmlShell(template, {
          html,
          title,
          head: headParts.length > 0 ? headParts.join('\n  ') : undefined,
          state: Object.keys(loadData).length > 0 ? loadData : undefined,
        })
        res.setHeader('Content-Type', 'text/html')
        res.end(fullHtml)
        return
      } catch {
        res.setHeader('Content-Type', 'text/html')
        res.end(html)
        return
      }
    } catch (e) {
      console.error('Error rendering error page:', e)
    }
  }

  res.statusCode = statusCode
  res.setHeader('Content-Type', 'text/html')
  res.end(renderDefaultErrorPage(statusCode, statusMessage, errUrl))
}

function buildSafeName(routePath: string, fallback: string): string {
  return routePath.replace(/\//g, '_').replace(/:/g, '_').replace(/^_/, '') || fallback
}
