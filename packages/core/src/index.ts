import type { Plugin, ViteDevServer } from 'vite'
import { resolve } from 'path'
import fs from 'fs'
import { buildRouteManifest } from './route-manifest.js'
import { handleRequest, type DevServerState } from './dev-server.js'
import { resolveConfig } from './config.js'

export type {
  Adapter,
  Route,
  RouteManifest,
  VitellaConfig,
  HttpMethod,
  ApiHandlerModule,
  BuildManifest,
} from './types.js'
export { matchRoute } from './route-matcher.js'
export { renderHtmlShell, loadHtmlShell } from './html-shell.js'
export { runMiddleware } from './middleware-chain.js'
export { generateBuildManifest } from './build.js'
export { resolveConfig } from './config.js'
export type { ResolvedVitellaConfig } from './config.js'
export { createProdServer } from './prod-server.js'
export type { ProdServerOptions } from './prod-server.js'

export function vitellaPlugin(userConfig?: Record<string, unknown>): Plugin {
  let state: DevServerState

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

    configureServer(server: ViteDevServer) {
      return () => {
        server.middlewares.use(async (req, res, next) => {
          const url = req.url || '/'

          // Skip Vite internal paths
          if (url.startsWith('/@') || url.startsWith('/node_modules') || url.startsWith('/__')) {
            return next()
          }

          const isPageOrApi = state.manifest.pages.some(r => r.pattern.test(url)) ||
            state.manifest.apis.some(r => r.pattern.test(url))

          if (!isPageOrApi) {
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
