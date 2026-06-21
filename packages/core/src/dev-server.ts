import type { ViteDevServer, ModuleNode } from 'vite'
import { IncomingMessage, ServerResponse } from 'http'
import { buildRouteManifest } from './route-manifest.js'
import { matchRoute } from './route-matcher.js'
import { runMiddleware } from './middleware-chain.js'
import { renderDefaultErrorPage } from './html-shell.js'
import { sendShellResponse } from './shell-renderer.js'
import type { ResolvedVitellaConfig } from './config.js'
import type { AdapterRenderResult, ApiHandlerModule, Route } from './types.js'
import {
  MAX_BODY_SIZE,
  setSecurityHeaders,
  sendJson,
  isStructuredResult,
  sanitizeTtl,
  mergeLoadResult,
  compressAndEnd,
  sendHtml,
} from './response-utils.js'
import { parseRequestContext, flushCookies, type RequestContext } from './request-context.js'
import { resolve as resolvePath, relative } from 'path'
import { loadHtmlShell, renderHtmlShell } from './html-shell.js'

export interface DevServerState {
  manifest: ReturnType<typeof buildRouteManifest>
  config: ResolvedVitellaConfig
}

function virtualClientUrl(pagePath: string): string {
  return `/@id/__x00__vitella:client-entry:${pagePath}`
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
  setSecurityHeaders(res, state.config.securityHeaders)

  const contentLength = parseInt(req.headers['content-length'] || '0', 10)
  if (contentLength > MAX_BODY_SIZE) {
    res.statusCode = 413
    await compressAndEnd(res, 'Request Entity Too Large', 'text/plain', req)
    return
  }

  const url = req.url || '/'
  const { manifest, config } = state

  await runMiddleware(config.middleware, req, res, async (req, res) => {
    const apiMatch = matchRoute(url, manifest.apis)
    if (apiMatch) {
      await handleApiRoute(apiMatch.route, apiMatch.params, req, res, vite)
      return
    }

    const pageMatch = matchRoute(url, manifest.pages)
    if (pageMatch) {
      await handlePageRoute(pageMatch.route, pageMatch.params, req, res, vite, state)
      return
    }

    await handleErrorPage(404, 'Not Found', req, res, vite, state)
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

  let layoutComponent: any = undefined
  if (route.layout) {
    const layoutMod = await vite.ssrLoadModule(route.layout)
    if (typeof layoutMod.load === 'function') {
      const result = await layoutMod.load({ req, ...ctx })
      const ttl = mergeLoadResult(result, loadData)
      if (ttl !== undefined) pageTtl = ttl
    }
    layoutComponent = layoutMod.default
  }

  if (typeof mod.load === 'function') {
    const result = await mod.load({ req, ...ctx })
    const ttl = mergeLoadResult(result, loadData)
    if (ttl !== undefined) pageTtl = ttl
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

    await sendShellResponse({
      html,
      title,
      head,
      loadData,
      scripts: scriptUrl ? [scriptUrl] : undefined,
      appShell: resolvePath(vite.config.root, config.appShell),
      ctx,
      res,
      req,
      vite,
    })
  } catch (e) {
    console.error('Error rendering page:', e)
    await handleErrorPage(500, 'Internal Server Error', req, res, vite, state)
  }
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
          const result = await layoutMod.load({ req, ...ctx })
          mergeLoadResult(result, loadData)
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

      await sendShellResponse({
        html,
        title,
        head,
        loadData,
        scripts: scriptUrl ? [scriptUrl] : undefined,
        appShell: resolvePath(vite.config.root, config.appShell),
        ctx,
        res,
        req,
        vite,
      })
      return
    } catch (e) {
      console.error('Error rendering error page:', e)
    }
  }

  res.statusCode = statusCode
  await sendHtml(res, renderDefaultErrorPage(statusCode, statusMessage, errUrl), req)
}
