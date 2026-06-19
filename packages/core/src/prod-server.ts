import http, { IncomingMessage, ServerResponse } from 'http'
import fs from 'fs'
import path from 'path'
import { matchRoute } from './route-matcher.js'
import { runMiddleware } from './middleware-chain.js'
import { loadHtmlShell, renderHtmlShell } from './html-shell.js'
import type { BuildManifest, Route, ApiHandlerModule } from './types.js'
import type { ResolvedVitellaConfig } from './config.js'

interface RouteData {
  path: string
  paramNames: string[]
  type: 'page' | 'api'
}

function deserializeRoutes(data: { pages: RouteData[]; apis: RouteData[] }): { pages: Route[]; apis: Route[] } {
  const toRoute = (r: RouteData): Route => ({
    path: r.path,
    paramNames: r.paramNames,
    type: r.type,
    filePath: '',
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
  routes?: { pages: RouteData[]; apis: RouteData[] }
  config?: ResolvedVitellaConfig
}

export async function createProdServer(options: ProdServerOptions): Promise<http.Server> {
  const { distDir, appShell } = options
  const manifestPath = path.join(distDir, 'manifest.json')
  const manifest: BuildManifest = options.manifest || JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  const routesPath = path.join(distDir, 'routes.json')
  const routes = deserializeRoutes(options.routes || (() => {
    try { return JSON.parse(fs.readFileSync(routesPath, 'utf-8')) } catch { return { pages: [], apis: [] } }
  })())
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

  const server = http.createServer(async (req, res) => {
    const url = req.url || '/'

    // Serve static assets immediately (skip route matching)
    if (isAssetUrl(url)) {
      const rawPath = path.join(clientDir, url)
      const staticPath = path.resolve(rawPath)
      if (!staticPath.startsWith(path.resolve(clientDir))) {
        res.statusCode = 403
        res.end('Forbidden')
        return
      }
      if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
        const ext = path.extname(staticPath)
        res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream')
        const stream = fs.createReadStream(staticPath)
        stream.on('error', () => {
          res.statusCode = 500
          res.end('Internal Server Error')
        })
        stream.pipe(res)
        return
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
              const result = await handler(req, res, apiMatch.params)
              res.statusCode = result.status || 200
              res.setHeader('Content-Type', 'application/json')
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

            if (typeof mod.load === 'function') {
              const queryStr = url.includes('?') ? url.split('?')[1] : ''
              const query = Object.fromEntries(new URLSearchParams(queryStr))
              const result = await mod.load({ params: pageMatch.params, query, cookies: {} })
              Object.assign(loadData, result)
            }

            if (config?.adapter && mod.default) {
              const renderResult = await config.adapter.render({
                page: url,
                component: mod.default,
                loadData,
                req,
                res,
              })
              html = typeof renderResult === 'string' ? renderResult : renderResult.html
            } else if (typeof mod.default === 'function') {
              html = mod.default(loadData)
            } else {
              html = mod.render ? await mod.render(loadData) : '<div></div>'
            }

            try {
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
          } catch {
            res.statusCode = 500
            res.end('Internal Server Error')
            return
          }
        }

        res.statusCode = 404
        res.end('Not Found')
      })
    } catch {
      res.statusCode = 500
      if (!res.writableEnded) res.end('Internal Server Error')
    }
  })

  return server
}

function buildSafeName(routePath: string, fallback: string): string {
  return routePath.replace(/\//g, '_').replace(/:/g, '_').replace(/^_/, '') || fallback
}
