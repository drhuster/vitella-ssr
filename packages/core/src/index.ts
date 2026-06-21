import type { Plugin, ViteDevServer } from 'vite'
import { extname, resolve, sep } from 'path'
import fs from 'fs'
import { buildRouteManifest } from './route-manifest.js'
import { handleRequest, type DevServerState } from './dev-server.js'
import { resolveConfig } from './config.js'

export type {
  Adapter,
  AdapterRenderResult,
  Route,
  RouteManifest,
  VitellaConfig,
  HttpMethod,
  ApiHandlerModule,
  BuildManifest,
  RequestContext,
  PageLoadContext,
} from './types.js'
export { matchRoute } from './route-matcher.js'
export { renderHtmlShell, loadHtmlShell } from './html-shell.js'
export { runMiddleware } from './middleware-chain.js'
export { generateBuildManifest } from './build.js'
export { resolveConfig } from './config.js'
export type { ResolvedVitellaConfig } from './config.js'
export { createProdServer } from './prod-server.js'
export type { ProdServerOptions } from './prod-server.js'
export { Cookies, serializeCookie } from './cookies.js'
export type { CookieOptions } from './cookies.js'
export { parseRequestContext, flushCookies, readBody, BodyTooLargeError, DEFAULT_MAX_BODY_SIZE } from './request-context.js'

const ASSET_MIME_TYPES: Record<string, string> = {
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
}

export function vitellaPlugin(userConfig?: Record<string, unknown>): Plugin {
  let state: DevServerState

  const VIRTUAL_PREFIX = '\0vitella:client-entry:'

  return {
    name: 'vitella-ssr',
    enforce: 'pre',

    config() {
      return { appType: 'custom' as const }
    },

    async configResolved(config) {
      const root = config.root || process.cwd()
      const resolved = await resolveConfig(userConfig as any)
      const pagesDir = resolve(root, resolved.pagesDir)
      const pageExts = resolved.adapter?.extensions
      const manifest = buildRouteManifest(pagesDir, resolve(root, resolved.serverDir), pageExts)

      state = { manifest, config: resolved }
    },

    resolveId(id: string) {
      if (id.startsWith(VIRTUAL_PREFIX)) {
        return id
      }
      if (id.startsWith('vitella:client-entry:')) {
        return VIRTUAL_PREFIX + id.slice('vitella:client-entry:'.length)
      }
      return null
    },

    load(id: string) {
      if (id.startsWith(VIRTUAL_PREFIX)) {
        const pagePath = id.slice(VIRTUAL_PREFIX.length)
        const adapter = state?.config?.adapter
        if (adapter?.getClientEntry) {
          const route = state?.manifest?.pages.find(r => r.filePath === pagePath)
          const errPage = state?.manifest?.errorPage
          const layout = route?.layout || (errPage?.filePath === pagePath ? errPage?.layout : undefined)
          return adapter.getClientEntry(id, pagePath, layout)
        }
        return null
      }
      return null
    },

    configureServer(server: ViteDevServer) {
      // Serve files from the assets directory at /assets/ URL prefix.
      // Runs before Vite's internal middlewares so Vite doesn't intercept.
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '/'
        if (url.startsWith('/assets/')) {
          const root = server.config.root
          const assetsDir = resolve(root, state.config.assetsDir)
          const relativePath = url.slice('/assets/'.length).split('?')[0]
          const filePath = resolve(assetsDir, relativePath)

          if (!filePath.startsWith(assetsDir + sep)) {
            res.statusCode = 403
            res.end('Forbidden')
            return
          }

          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = extname(filePath)
            res.setHeader('Content-Type', ASSET_MIME_TYPES[ext] || 'application/octet-stream')
            res.setHeader('X-Content-Type-Options', 'nosniff')
            res.setHeader('X-Frame-Options', 'DENY')
            res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
            const imageTtl = state.config.ttl?.images
            if (imageTtl && imageTtl > 0) {
              res.setHeader('Cache-Control', `public, max-age=${imageTtl}`)
            }
            const stat = fs.statSync(filePath)
            const etag = `"${stat.mtimeMs}-${stat.size}"`
            const reqHeaders = (req.headers as Record<string, string | string[] | undefined>) || {}
            if (reqHeaders['if-none-match'] === etag) {
              res.statusCode = 304
              res.end()
              return
            }
            res.setHeader('ETag', etag)
            const stream = fs.createReadStream(filePath)
            const cleanup = () => stream.destroy()
            res.on('close', cleanup)
            stream.on('error', () => {
              cleanup()
              if (!res.writableEnded) {
                res.statusCode = 500
                res.end('Internal Server Error')
              }
            })
            stream.pipe(res)
            return
          }
        }
        next()
      })

      return () => {
        server.middlewares.use(async (req, res, next) => {
          const url = req.url || '/'

          // Skip Vite internal paths
          if (url.startsWith('/@') || url.startsWith('/node_modules') || url.startsWith('/__')) {
            return next()
          }

          try {
            await handleRequest(req, res, server, state)
          } catch (err) {
            console.error('Vitella SSR error:', err)
            res.statusCode = 500
            res.end('Internal Server Error')
          }
        })
      }
    },

    buildStart() {
      if (state) {
        const root = process.cwd()
        const pagesDir = resolve(root, state.config.pagesDir)
        const pageExts = state.config.adapter?.extensions
        state.manifest = buildRouteManifest(pagesDir, resolve(root, state.config.serverDir), pageExts)
      }
    },
  }
}
