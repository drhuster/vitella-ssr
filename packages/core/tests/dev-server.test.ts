import { describe, it, expect, vi, beforeEach } from 'vitest'
import { vitellaPlugin } from '../src/index.js'

vi.mock('../src/route-matcher.js', () => ({
  matchRoute: vi.fn(),
}))

vi.mock('../src/middleware-chain.js', () => ({
  runMiddleware: vi.fn((_mw: any, _req: any, _res: any, next: any) => next(_req, _res)),
}))

vi.mock('../src/html-shell.js', () => ({
  loadHtmlShell: vi.fn(() => '<html><head><!--vitella-head--></head><body><!--vitella-html--><!--vitella-scripts--></body></html>'),
  renderHtmlShell: vi.fn((template: string, data: any) => {
    let result = template.replace('<!--vitella-html-->', data.html || '')
    if (data.title) result = result.replace('<!--vitella-head-->', `<title>${data.title}</title>`)
    return result
  }),
  renderDefaultErrorPage: vi.fn((statusCode: number, statusMessage: string, url: string) =>
    `<html><body><h1>${statusCode} ${statusMessage}</h1><p>${url}</p></body></html>`
  ),
}))

vi.mock('../src/request-context.js', () => ({
  parseRequestContext: vi.fn(() => ({
    params: {},
    query: {},
    cookies: { getAll: vi.fn(() => ({})), set: vi.fn(), toSetCookieHeaders: vi.fn(() => []) },
  })),
  flushCookies: vi.fn(),
}))

import { matchRoute } from '../src/route-matcher.js'
import { handleRequest } from '../src/dev-server.js'

describe('vitellaPlugin', () => {
  it('returns a Vite plugin object with correct name', () => {
    const plugin = vitellaPlugin()
    expect(plugin.name).toBe('vitella-ssr')
  })

  it('plugin has configureServer hook', () => {
    const plugin = vitellaPlugin()
    expect(typeof plugin.configureServer).toBe('function')
  })

  it('plugin has buildStart hook', () => {
    const plugin = vitellaPlugin()
    expect(typeof plugin.buildStart).toBe('function')
  })

  it('plugin has enforce pre', () => {
    const plugin = vitellaPlugin()
    expect(plugin.enforce).toBe('pre')
  })

  it('registers resolveId and load hooks for virtual modules', () => {
    const plugin = vitellaPlugin() as any
    expect(typeof plugin.resolveId).toBe('function')
    expect(typeof plugin.load).toBe('function')
  })

  it('resolveId handles vitella:client-entry: prefix', () => {
    const plugin = vitellaPlugin() as any
    const resolved = plugin.resolveId('vitella:client-entry:/src/pages/index.vue')
    expect(resolved).toBe('\0vitella:client-entry:/src/pages/index.vue')
  })

  it('resolveId handles \\0-prefixed id from /@id/ URL decoding', () => {
    const plugin = vitellaPlugin() as any
    const resolved = plugin.resolveId('\0vitella:client-entry:/src/pages/index.vue')
    expect(resolved).toBe('\0vitella:client-entry:/src/pages/index.vue')
  })

  it('resolveId returns null for non-virtual modules', () => {
    const plugin = vitellaPlugin() as any
    const resolved = plugin.resolveId('./normal-module.js')
    expect(resolved).toBeNull()
  })
})

describe('handleRequest', () => {
  let req: any
  let res: any
  let vite: any
  let state: any

  beforeEach(() => {
    vi.clearAllMocks()
    req = { url: '/', method: 'GET', headers: { host: 'localhost' } }
    res = { statusCode: 200, end: vi.fn(), setHeader: vi.fn(), appendHeader: vi.fn() }
    vite = { ssrLoadModule: vi.fn(), config: { root: '/fake' } }
    state = {
      manifest: { pages: [], apis: [] },
      config: { middleware: [], adapter: null, appShell: '/fake/app.html', ttl: {}, assetsDir: 'public' },
    }
  })

  it('returns 404 when no route matches', async () => {
    vi.mocked(matchRoute).mockReturnValue(null)
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(404)
    expect(res.end).toHaveBeenCalledWith('<html><body><h1>404 Not Found</h1><p>/</p></body></html>')
  })

  it('handles API route match', async () => {
    const apiRoute = { filePath: 'src/server/api/hello.js', path: '/api/hello', paramNames: [], pattern: /\//, type: 'api' as const }
    vi.mocked(matchRoute).mockImplementation((url: string) => {
      if (url === '/api/hello') return { route: apiRoute, params: {} }
      return null
    })
    vite.ssrLoadModule.mockResolvedValue({
      get: vi.fn().mockResolvedValue({ status: 200, body: { message: 'hello' } }),
    })
    req.url = '/api/hello'
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(200)
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ message: 'hello' }))
  })

  it('returns 405 for API route without matching method handler', async () => {
    const apiRoute = { filePath: 'src/server/api/hello.js', path: '/api/hello', paramNames: [], pattern: /\//, type: 'api' as const }
    vi.mocked(matchRoute).mockImplementation((url: string) => {
      if (url === '/api/hello') return { route: apiRoute, params: {} }
      return null
    })
    vite.ssrLoadModule.mockResolvedValue({ post: vi.fn() })
    req.url = '/api/hello'
    req.method = 'PUT'
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(405)
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ error: 'Method not allowed' }))
  })

  it('renders page route without adapter configured', async () => {
    const pageRoute = { filePath: 'src/pages/index.vue', path: '/', paramNames: [], pattern: /^\//, type: 'page' as const }
    vi.mocked(matchRoute).mockReturnValueOnce(null).mockReturnValueOnce({ route: pageRoute, params: {} })
    vite.ssrLoadModule.mockResolvedValue({ default: 'Component', load: vi.fn() })
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(200)
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html')
    expect(res.end).toHaveBeenCalled()
  })

  it('renders page route with adapter', async () => {
    const adapter = {
      name: 'test',
      extensions: ['.vue'],
      render: vi.fn().mockResolvedValue('<div>Rendered</div>'),
    }
    state.config.adapter = adapter
    const pageRoute = { filePath: 'src/pages/index.vue', path: '/', paramNames: [], pattern: /^\//, type: 'page' as const }
    vi.mocked(matchRoute).mockReturnValueOnce(null).mockReturnValueOnce({ route: pageRoute, params: {} })
    vite.ssrLoadModule.mockResolvedValue({ default: 'Component' })
    await handleRequest(req, res, vite, state)
    expect(adapter.render).toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
    expect(res.end).toHaveBeenCalled()
  })

  it('renders page route with structured adapter result', async () => {
    const adapter = {
      name: 'test',
      extensions: ['.vue'],
      render: vi.fn().mockResolvedValue({ html: '<div>Rendered</div>', title: 'Page Title', head: '<meta>' }),
      getClientEntry: vi.fn(() => 'import {} from "vue"'),
    }
    state.config.adapter = adapter
    const pageRoute = { filePath: 'src/pages/index.vue', path: '/', paramNames: [], pattern: /^\//, type: 'page' as const }
    vi.mocked(matchRoute).mockReturnValueOnce(null).mockReturnValueOnce({ route: pageRoute, params: {} })
    vite.ssrLoadModule.mockResolvedValue({ default: 'Component' })
    await handleRequest(req, res, vite, state)
    expect(adapter.render).toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
    expect(res.end).toHaveBeenCalled()
  })

  it('loads layout module when page route has layout', async () => {
    const adapter = {
      name: 'test',
      extensions: ['.vue'],
      render: vi.fn().mockResolvedValue('<div>Rendered</div>'),
    }
    state.config.adapter = adapter
    const layoutPath = 'src/layouts/default.vue'
    const pageRoute = { filePath: 'src/pages/index.vue', path: '/', paramNames: [], pattern: /^\//, type: 'page' as const, layout: layoutPath }
    vi.mocked(matchRoute).mockReturnValueOnce(null).mockReturnValueOnce({ route: pageRoute, params: {} })
    vite.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path === layoutPath) return { default: 'LayoutComponent', load: vi.fn().mockResolvedValue({ layoutData: 'data' }) }
      if (path === 'src/pages/index.vue') return { default: 'PageComponent', load: vi.fn().mockResolvedValue({ pageData: 'value' }) }
      return {}
    })
    await handleRequest(req, res, vite, state)
    expect(vite.ssrLoadModule).toHaveBeenCalledWith(layoutPath)
    expect(vite.ssrLoadModule).toHaveBeenCalledWith(pageRoute.filePath)
    expect(adapter.render).toHaveBeenCalled()
  })

  it('sets Cache-Control header from config.ttl.pages', async () => {
    state.config.adapter = {
      name: 'test',
      extensions: ['.vue'],
      render: vi.fn().mockResolvedValue('<div>Rendered</div>'),
    }
    state.config.ttl = { pages: 3600 }
    const pageRoute = { filePath: 'src/pages/index.vue', path: '/', paramNames: [], pattern: /^\//, type: 'page' as const }
    vi.mocked(matchRoute).mockReturnValueOnce(null).mockReturnValueOnce({ route: pageRoute, params: {} })
    vite.ssrLoadModule.mockResolvedValue({ default: 'Component' })
    await handleRequest(req, res, vite, state)
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=3600')
  })
})
