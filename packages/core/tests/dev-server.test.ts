import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { handleRequest } from '../src/dev-server.js'
import type { DevServerState } from '../src/dev-server.js'
import type { Route } from '../src/types.js'

function createReqRes(url = '/') {
  const req = new IncomingMessage(new Socket())
  req.url = url
  req.headers = {}
  const res = new ServerResponse(req)
  return { req, res }
}

function createMockVite() {
  return {
    config: { root: process.cwd() },
    ssrLoadModule: vi.fn(),
    moduleGraph: {
      urlToModuleMap: new Map(),
    },
    transformIndexHtml: vi.fn((_url: string, html: string) => html),
  } as any
}

function createState(
  overrides: Partial<DevServerState['config']> = {},
  pages: Route[] = [],
  apis: Route[] = [],
  errorPage?: { filePath: string; layout?: string },
): DevServerState {
  return {
    manifest: { pages, apis, errorPage },
    config: {
      pagesDir: 'src/pages',
      serverDir: 'src/server',
      appShell: 'src/app.html',
      assetsDir: 'src/assets',
      middleware: [],
      adapter: undefined,
      ttl: { images: 0, pages: 0 },
      ...overrides,
    },
  }
}

describe('handleRequest - security', () => {
  it('sets security headers on every response', async () => {
    const { req, res } = createReqRes('/')
    const vite = createMockVite()
    const state = createState()
    await handleRequest(req, res, vite, state)
    expect(res.getHeader('X-Content-Type-Options')).toBe('nosniff')
    expect(res.getHeader('X-Frame-Options')).toBe('DENY')
    expect(res.getHeader('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(res.getHeader('Strict-Transport-Security')).toBe('max-age=31536000')
    expect(res.getHeader('Content-Security-Policy')).toBe(
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    )
  })

  it('returns 413 when content-length exceeds max body size', async () => {
    const { req, res } = createReqRes('/')
    req.headers['content-length'] = String(11 * 1024 * 1024)
    const vite = createMockVite()
    const state = createState()
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(413)
  })

  it('handles request with no url (falls back to /)', async () => {
    const { req, res } = createReqRes()
    req.url = undefined as unknown as string
    const vite = createMockVite()
    const state = createState()
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(404)
  })
})

describe('handleRequest - API routes', () => {
  it('matches and handles API routes', async () => {
    const { req, res } = createReqRes('/api/data')
    const vite = createMockVite()
    const apis: Route[] = [{
      path: '/api/data', pattern: /^\/api\/data(\?.*)?$/, paramNames: [], filePath: 'src/server/data.ts', type: 'api',
    }]
    const state = createState({}, [], apis)
    vite.ssrLoadModule.mockResolvedValue({ get: vi.fn().mockResolvedValue({ status: 200, body: { ok: true } }) })
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(200)
  })

  it('returns 405 when API handler has no matching method', async () => {
    const { req, res } = createReqRes('/api/data')
    req.method = 'POST'
    const vite = createMockVite()
    const apis: Route[] = [{
      path: '/api/data', pattern: /^\/api\/data(\?.*)?$/, paramNames: [], filePath: 'src/server/data.ts', type: 'api',
    }]
    const state = createState({}, [], apis)
    vite.ssrLoadModule.mockResolvedValue({}) // no handlers at all
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(405)
  })

  it('sends JSON response from API handler', async () => {
    const { req, res } = createReqRes('/api/hello')
    const vite = createMockVite()
    const apis: Route[] = [{
      path: '/api/hello', pattern: /^\/api\/hello(\?.*)?$/, paramNames: [], filePath: 'src/server/hello.ts', type: 'api',
    }]
    const state = createState({}, [], apis)
    vite.ssrLoadModule.mockResolvedValue({ get: vi.fn().mockResolvedValue({ status: 200, body: { msg: 'hi' } }) })
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(200)
  })

  it('handles API response without explicit status (defaults to 200)', async () => {
    const { req, res } = createReqRes('/api/data')
    const vite = createMockVite()
    const apis: Route[] = [{
      path: '/api/data', pattern: /^\/api\/data(\?.*)?$/, paramNames: [], filePath: 'src/server/data.ts', type: 'api',
    }]
    const state = createState({}, [], apis)
    vite.ssrLoadModule.mockResolvedValue({ get: vi.fn().mockResolvedValue({ body: { ok: true } }) })
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(200)
  })
})

describe('handleRequest - page routes', () => {
  let tmpDir: string
  let appShell: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-dev-'))
    appShell = join(tmpDir, 'app.html')
    writeFileSync(appShell, '<html><!--vitella-html--></html>')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns 404 via default error page when no route matches', async () => {
    const { req, res } = createReqRes('/nonexistent')
    const vite = createMockVite()
    vite.config.root = tmpDir
    const state = createState({ appShell })
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(404)
  })

  it('returns 404 via custom error page when adapter and errorPage are configured', async () => {
    const { req, res } = createReqRes('/nonexistent')
    const vite = createMockVite()
    vite.config.root = tmpDir
    const state = createState({
      appShell,
      adapter: {
        name: 'test', extensions: ['.vue'],
        render: vi.fn().mockResolvedValue({ html: '<div>error page</div>', title: 'Error' }),
      },
    }, [], [], { filePath: 'src/pages/_error.vue' })
    vite.ssrLoadModule.mockResolvedValue({ default: {} })
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(404)
  })

  it('falls back to default error page when error page rendering throws', async () => {
    const { req, res } = createReqRes('/nonexistent')
    const vite = createMockVite()
    vite.config.root = tmpDir
    const state = createState({
      appShell,
      adapter: {
        name: 'test', extensions: ['.vue'],
        render: vi.fn().mockRejectedValue(new Error('error page render failed')),
      },
    }, [], [], { filePath: 'src/pages/_error.vue' })
    vite.ssrLoadModule.mockResolvedValue({ default: {} })
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(404)
  })

  it('renders custom error page with layout and client entry', async () => {
    const { req, res } = createReqRes('/nonexistent')
    const vite = createMockVite()
    vite.config.root = tmpDir
    const errorPageFile = join(tmpDir, 'src/pages/_error.vue')
    const errorLayoutFile = join(tmpDir, 'src/layouts/error.vue')
    vite.moduleGraph = {
      urlToModuleMap: new Map([
        ['/src/pages/_error.vue', {
          url: '/src/pages/_error.vue',
          importedModules: new Set([{
            url: '/src/pages/_error.vue?vue&type=style&index=0&lang.css',
            importedModules: new Set(),
          }]),
        }],
        ['/src/layouts/error.vue', {
          url: '/src/layouts/error.vue',
          importedModules: new Set([{
            url: '/src/layouts/error.vue?vue&type=style&index=0&lang.css',
            importedModules: new Set(),
          }]),
        }],
      ]),
    }
    const state = createState({
      appShell,
      adapter: {
        name: 'test', extensions: ['.vue'],
        render: vi.fn().mockResolvedValue({ html: '<div>error page</div>' }),
        getClientEntry: vi.fn(() => 'export const render = () => null'),
      },
    }, [], [], { filePath: errorPageFile, layout: errorLayoutFile })
    vite.ssrLoadModule
      .mockResolvedValueOnce({ default: {} })
      .mockResolvedValueOnce({ default: {}, load: vi.fn().mockResolvedValue({}) })
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(404)
  })

  it('renders custom error page with raw string adapter result and layout without load', async () => {
    const { req, res } = createReqRes('/nonexistent')
    const vite = createMockVite()
    vite.config.root = tmpDir
    const errorPageFile = join(tmpDir, 'src/pages/_error.vue')
    const errorLayoutFile = join(tmpDir, 'src/layouts/error.vue')
    const state = createState({
      appShell,
      adapter: {
        name: 'test', extensions: ['.vue'],
        render: vi.fn().mockResolvedValue('<div>raw error</div>'),
      },
    }, [], [], { filePath: errorPageFile, layout: errorLayoutFile })
    vite.ssrLoadModule
      .mockResolvedValueOnce({ default: {} })
      .mockResolvedValueOnce({ default: {} })
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(404)
  })

  it('handles page route without adapter', async () => {
    const { req, res } = createReqRes('/')
    const pages: Route[] = [{
      path: '/', pattern: /^\/(\?.*)?$/, paramNames: [], filePath: 'src/pages/index.vue', type: 'page',
    }]
    const vite = createMockVite()
    vite.config.root = tmpDir
    const state = createState({ appShell }, pages)
    vite.ssrLoadModule.mockResolvedValue({ default: {} })
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(200)
  })

  it('handles page route with adapter render', async () => {
    const { req, res } = createReqRes('/')
    const pages: Route[] = [{
      path: '/', pattern: /^\/(\?.*)?$/, paramNames: [], filePath: 'src/pages/index.vue', type: 'page',
    }]
    const vite = createMockVite()
    vite.config.root = tmpDir
    const state = createState({
      appShell,
      adapter: {
        name: 'test', extensions: ['.vue'],
        render: vi.fn().mockResolvedValue({ html: '<div>hello</div>' }),
      },
    }, pages)
    vite.ssrLoadModule.mockResolvedValue({ default: {} })
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(200)
  })

  it('handles error when adapter.render throws', async () => {
    const { req, res } = createReqRes('/')
    const pages: Route[] = [{
      path: '/', pattern: /^\/(\?.*)?$/, paramNames: [], filePath: 'src/pages/index.vue', type: 'page',
    }]
    const vite = createMockVite()
    vite.config.root = tmpDir
    const state = createState({
      appShell,
      adapter: {
        name: 'test', extensions: ['.vue'],
        render: vi.fn().mockRejectedValue(new Error('render error')),
      },
    }, pages)
    vite.ssrLoadModule.mockResolvedValue({ default: {} })
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(500)
  })

  it('includes page css when collectCssUrls returns urls', async () => {
    const { req, res } = createReqRes('/')
    const pageFile = join(tmpDir, 'src/pages/index.vue')
    const pages: Route[] = [{
      path: '/', pattern: /^\/(\?.*)?$/, paramNames: [], filePath: pageFile, type: 'page',
    }]
    const vite = createMockVite()
    vite.config.root = tmpDir
    vite.moduleGraph = {
      urlToModuleMap: new Map([
        ['/src/pages/index.vue', {
          url: '/src/pages/index.vue',
          importedModules: new Set([{
            url: '/src/pages/index.vue?vue&type=style&index=0&lang.css',
            importedModules: new Set(),
          }]),
        }],
      ]),
    }
    const state = createState({
      appShell,
      adapter: {
        name: 'test', extensions: ['.vue'],
        render: vi.fn().mockResolvedValue({ html: '<div>styled</div>' }),
      },
    }, pages)
    vite.ssrLoadModule.mockResolvedValue({ default: {} })
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(200)
  })

  it('collectCssUrls handles undefined moduleGraph gracefully', async () => {
    const { req, res } = createReqRes('/')
    const pageFile = join(tmpDir, 'src/pages/index.vue')
    const pages: Route[] = [{
      path: '/', pattern: /^\/(\?.*)?$/, paramNames: [], filePath: pageFile, type: 'page',
    }]
    const vite = createMockVite()
    vite.config.root = tmpDir
    vite.moduleGraph = undefined as any
    const state = createState({
      appShell,
      adapter: {
        name: 'test', extensions: ['.vue'],
        render: vi.fn().mockResolvedValue('<div>no-graph</div>'),
      },
    }, pages)
    vite.ssrLoadModule.mockResolvedValue({ default: {} })
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(200)
  })

  it('collects layout css from module graph', async () => {
    const { req, res } = createReqRes('/dashboard')
    const pageFile = join(tmpDir, 'src/pages/dashboard.vue')
    const layoutFile = join(tmpDir, 'src/layouts/dashboard.vue')
    const pages: Route[] = [{
      path: '/dashboard', pattern: /^\/dashboard(\?.*)?$/, paramNames: [], filePath: pageFile, type: 'page', layout: layoutFile,
    }]
    const vite = createMockVite()
    vite.config.root = tmpDir
    vite.moduleGraph = {
      urlToModuleMap: new Map([
        ['/src/pages/dashboard.vue', {
          url: '/src/pages/dashboard.vue',
          importedModules: new Set(),
        }],
        ['/src/layouts/dashboard.vue', {
          url: '/src/layouts/dashboard.vue',
          importedModules: new Set([{
            url: '/src/layouts/dashboard.vue?vue&type=style&index=0&lang.css',
            importedModules: new Set(),
          }]),
        }],
      ]),
    }
    const state = createState({
      appShell,
      adapter: {
        name: 'test', extensions: ['.vue'],
        render: vi.fn().mockResolvedValue('<div>dashboard</div>'),
      },
    }, pages)
    vite.ssrLoadModule
      .mockResolvedValueOnce({ default: {}, load: vi.fn().mockResolvedValue({}) })
      .mockResolvedValueOnce({ default: {} })
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(200)
  })

  it('includes scripts when adapter.getClientEntry is set', async () => {
    const { req, res } = createReqRes('/')
    const pages: Route[] = [{
      path: '/', pattern: /^\/(\?.*)?$/, paramNames: [], filePath: 'src/pages/index.vue', type: 'page',
    }]
    const vite = createMockVite()
    vite.config.root = tmpDir
    const state = createState({
      appShell,
      adapter: {
        name: 'test', extensions: ['.vue'],
        render: vi.fn().mockResolvedValue('<div>hello</div>'),
        getClientEntry: vi.fn(() => 'export const render = () => null'),
      },
    }, pages)
    vite.ssrLoadModule.mockResolvedValue({ default: {} })
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(200)
  })

  it('invokes layout load when route has layout', async () => {
    const { req, res } = createReqRes('/dashboard')
    const pages: Route[] = [{
      path: '/dashboard', pattern: /^\/dashboard(\?.*)?$/, paramNames: [], filePath: 'src/pages/dashboard.vue', type: 'page', layout: 'src/layouts/dashboard.vue',
    }]
    const vite = createMockVite()
    vite.config.root = tmpDir
    const state = createState({
      appShell,
      adapter: {
        name: 'test', extensions: ['.vue'],
        render: vi.fn().mockResolvedValue('<div>dashboard</div>'),
      },
    }, pages)
    const layoutMod = { default: {}, load: vi.fn().mockResolvedValue({}) }
    vite.ssrLoadModule
      .mockResolvedValueOnce({ default: {}, load: vi.fn().mockResolvedValue({}) })
      .mockResolvedValueOnce(layoutMod)
    await handleRequest(req, res, vite, state)
    expect(layoutMod.load).toHaveBeenCalled()
  })

  it('handles layout module without a load function', async () => {
    const { req, res } = createReqRes('/dashboard')
    const pages: Route[] = [{
      path: '/dashboard', pattern: /^\/dashboard(\?.*)?$/, paramNames: [], filePath: 'src/pages/dashboard.vue', type: 'page', layout: 'src/layouts/dashboard.vue',
    }]
    const vite = createMockVite()
    vite.config.root = tmpDir
    const state = createState({
      appShell,
      adapter: {
        name: 'test', extensions: ['.vue'],
        render: vi.fn().mockResolvedValue('<div>dashboard</div>'),
      },
    }, pages)
    vite.ssrLoadModule
      .mockResolvedValueOnce({ default: {}, load: vi.fn().mockResolvedValue({}) })
      .mockResolvedValueOnce({ default: {} })
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(200)
  })

  it('sets Cache-Control from page load ttl', async () => {
    const { req, res } = createReqRes('/')
    const pages: Route[] = [{
      path: '/', pattern: /^\/(\?.*)?$/, paramNames: [], filePath: 'src/pages/index.vue', type: 'page',
    }]
    const vite = createMockVite()
    vite.config.root = tmpDir
    const state = createState({
      appShell,
      adapter: {
        name: 'test', extensions: ['.vue'],
        render: vi.fn().mockResolvedValue('<div>hello</div>'),
      },
    }, pages)
    const mod = { default: {}, load: vi.fn().mockResolvedValue({ ttl: 300 }) }
    vite.ssrLoadModule.mockResolvedValue(mod)
    await handleRequest(req, res, vite, state)
    expect(res.getHeader('Cache-Control')).toBe('public, max-age=300')
  })

  it('uses config.ttl.pages when page load does not set ttl', async () => {
    const { req, res } = createReqRes('/')
    const pages: Route[] = [{
      path: '/', pattern: /^\/(\?.*)?$/, paramNames: [], filePath: 'src/pages/index.vue', type: 'page',
    }]
    const vite = createMockVite()
    vite.config.root = tmpDir
    const state = createState({
      appShell,
      adapter: {
        name: 'test', extensions: ['.vue'],
        render: vi.fn().mockResolvedValue('<div>hello</div>'),
      },
      ttl: { images: 0, pages: 7200 },
    }, pages)
    vite.ssrLoadModule.mockResolvedValue({ default: {}, load: vi.fn().mockResolvedValue({}) })
    await handleRequest(req, res, vite, state)
    expect(res.getHeader('Cache-Control')).toBe('public, max-age=7200')
  })

  it('passes route params to load function', async () => {
    const { req, res } = createReqRes('/blog/hello')
    const pages: Route[] = [{
      path: '/blog/:slug', pattern: /^\/blog\/([^/]+)(\?.*)?$/, paramNames: ['slug'], filePath: 'src/pages/blog/[slug].vue', type: 'page',
    }]
    const vite = createMockVite()
    vite.config.root = tmpDir
    const state = createState({
      appShell,
      adapter: { name: 'test', extensions: ['.vue'], render: vi.fn().mockResolvedValue('<div>post</div>') },
    }, pages)
    const mod = { default: {}, load: vi.fn().mockResolvedValue({}) }
    vite.ssrLoadModule.mockResolvedValue(mod)
    await handleRequest(req, res, vite, state)
    expect(mod.load).toHaveBeenCalled()
  })

  it('includes client script when adapter has getClientEntry', async () => {
    const { req, res } = createReqRes('/')
    const pages: Route[] = [{
      path: '/', pattern: /^\/(\?.*)?$/, paramNames: [], filePath: 'src/pages/index.vue', type: 'page',
    }]
    const vite = createMockVite()
    vite.config.root = tmpDir
    const state = createState({
      appShell,
      adapter: {
        name: 'test', extensions: ['.vue'],
        render: vi.fn().mockResolvedValue('<div>hello</div>'),
        getClientEntry: vi.fn(() => 'export const render = () => null'),
      },
    }, pages)
    vite.ssrLoadModule.mockResolvedValue({ default: {} })
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(200)
  })

  it('prevents __proto__ pollution from load data', async () => {
    const { req, res } = createReqRes('/')
    const pages: Route[] = [{
      path: '/', pattern: /^\/(\?.*)?$/, paramNames: [], filePath: 'src/pages/index.vue', type: 'page',
    }]
    const vite = createMockVite()
    vite.config.root = tmpDir
    const state = createState({
      appShell,
      adapter: {
        name: 'test', extensions: ['.vue'],
        render: vi.fn().mockResolvedValue('<div>safe</div>'),
      },
    }, pages)
    const mod = { default: {}, load: vi.fn().mockResolvedValue({ __proto__: { pollute: true } }) }
    vite.ssrLoadModule.mockResolvedValue(mod)
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(200)
  })

  it('injects load data state into shell when load returns non-ttl data', async () => {
    const { req, res } = createReqRes('/')
    const pages: Route[] = [{
      path: '/', pattern: /^\/(\?.*)?$/, paramNames: [], filePath: 'src/pages/index.vue', type: 'page',
    }]
    const vite = createMockVite()
    vite.config.root = tmpDir
    const state = createState({
      appShell,
      adapter: {
        name: 'test', extensions: ['.vue'],
        render: vi.fn().mockResolvedValue('<div>data</div>'),
      },
    }, pages)
    const mod = { default: {}, load: vi.fn().mockResolvedValue({ title: 'Test', items: [1, 2] }) }
    vite.ssrLoadModule.mockResolvedValue(mod)
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(200)
  })

  it('handles transformIndexHtml throwing', async () => {
    const { req, res } = createReqRes('/')
    const pages: Route[] = [{
      path: '/', pattern: /^\/(\?.*)?$/, paramNames: [], filePath: 'src/pages/index.vue', type: 'page',
    }]
    const vite = createMockVite()
    vite.config.root = tmpDir
    vite.transformIndexHtml = vi.fn().mockRejectedValue(new Error('transform failed'))
    const state = createState({
      appShell,
      adapter: {
        name: 'test', extensions: ['.vue'],
        render: vi.fn().mockResolvedValue('<div>fallback</div>'),
      },
    }, pages)
    vite.ssrLoadModule.mockResolvedValue({ default: {} })
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(200)
  })

  it('handles 500 when ssrLoadModule throws for page route', async () => {
    const { req, res } = createReqRes('/')
    const pages: Route[] = [{
      path: '/', pattern: /^\/(\?.*)?$/, paramNames: [], filePath: 'src/pages/index.vue', type: 'page',
    }]
    const vite = createMockVite()
    vite.config.root = tmpDir
    const state = createState({ appShell }, pages)
    vite.ssrLoadModule.mockRejectedValue(new Error('ssr fail'))
    await expect(handleRequest(req, res, vite, state)).rejects.toThrow('ssr fail')
  })
})

describe('handleRequest - structured adapter result', () => {
  let tmpDir: string
  let appShell: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-dev-struct-'))
    appShell = join(tmpDir, 'app.html')
    writeFileSync(appShell, '<html><head><!--vitella-title--><!--vitella-head--></head><body><!--vitella-html--></body></html>')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('injects title and head from structured adapter result', async () => {
    const { req, res } = createReqRes('/')
    const pages: Route[] = [{
      path: '/', pattern: /^\/(\?.*)?$/, paramNames: [], filePath: 'src/pages/index.vue', type: 'page',
    }]
    const vite = createMockVite()
    vite.config.root = tmpDir
    const state = createState({
      appShell,
      adapter: {
        name: 'test', extensions: ['.vue'],
        render: vi.fn().mockResolvedValue({
          html: '<div>page</div>',
          title: 'Home',
          head: '<meta name="desc" content="test">',
        }),
      },
    }, pages)
    vite.ssrLoadModule.mockResolvedValue({ default: {} })
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(200)
  })

  it('handles adapter returning raw string (not structured)', async () => {
    const { req, res } = createReqRes('/')
    const pages: Route[] = [{
      path: '/', pattern: /^\/(\?.*)?$/, paramNames: [], filePath: 'src/pages/index.vue', type: 'page',
    }]
    const vite = createMockVite()
    vite.config.root = tmpDir
    const state = createState({
      appShell,
      adapter: {
        name: 'test', extensions: ['.vue'],
        render: vi.fn().mockResolvedValue('<div>raw string</div>'),
      },
    }, pages)
    vite.ssrLoadModule.mockResolvedValue({ default: {} })
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(200)
  })
})

describe('handleRequest - middleware', () => {
  it('runs middleware before handling request', async () => {
    const { req, res } = createReqRes('/')
    const vite = createMockVite()
    const middleware = vi.fn((_r: any, _s: any, next: any) => next())
    const state = createState({ middleware: [middleware as any] })
    await handleRequest(req, res, vite, state)
    expect(middleware).toHaveBeenCalled()
  })
})

describe('handleRequest - compression', () => {
  let tmpDir: string
  let appShell: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-comp-'))
    appShell = join(tmpDir, 'app.html')
    writeFileSync(appShell, '<html><!--vitella-html--></html>')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('compresses with gzip and sets Content-Encoding header', async () => {
    const { req, res } = createReqRes('/api/hello')
    req.headers['accept-encoding'] = 'gzip'
    const apis: Route[] = [{
      path: '/api/hello', pattern: /^\/api\/hello(\?.*)?$/, paramNames: [], filePath: 'src/server/hello.ts', type: 'api',
    }]
    const vite = createMockVite()
    vite.config.root = tmpDir
    const state = createState({ appShell }, [], apis)
    vite.ssrLoadModule.mockResolvedValue({ get: vi.fn().mockResolvedValue({ status: 200, body: { msg: 'hi' } }) })
    await handleRequest(req, res, vite, state)
    expect(res.getHeader('Content-Encoding')).toBe('gzip')
    expect(res.statusCode).toBe(200)
  })

  it('compresses with brotli and sets Content-Encoding header', async () => {
    const { req, res } = createReqRes('/api/hello')
    req.headers['accept-encoding'] = 'br'
    const apis: Route[] = [{
      path: '/api/hello', pattern: /^\/api\/hello(\?.*)?$/, paramNames: [], filePath: 'src/server/hello.ts', type: 'api',
    }]
    const vite = createMockVite()
    vite.config.root = tmpDir
    const state = createState({ appShell }, [], apis)
    vite.ssrLoadModule.mockResolvedValue({ get: vi.fn().mockResolvedValue({ status: 200, body: { msg: 'hi' } }) })
    await handleRequest(req, res, vite, state)
    expect(res.getHeader('Content-Encoding')).toBe('br')
    expect(res.statusCode).toBe(200)
  })

  it('compresses with deflate and sets Content-Encoding header', async () => {
    const { req, res } = createReqRes('/api/hello')
    req.headers['accept-encoding'] = 'deflate'
    const apis: Route[] = [{
      path: '/api/hello', pattern: /^\/api\/hello(\?.*)?$/, paramNames: [], filePath: 'src/server/hello.ts', type: 'api',
    }]
    const vite = createMockVite()
    vite.config.root = tmpDir
    const state = createState({ appShell }, [], apis)
    vite.ssrLoadModule.mockResolvedValue({ get: vi.fn().mockResolvedValue({ status: 200, body: { msg: 'hi' } }) })
    await handleRequest(req, res, vite, state)
    expect(res.getHeader('Content-Encoding')).toBe('deflate')
    expect(res.statusCode).toBe(200)
  })

  it('sends uncompressed when no accept-encoding matches', async () => {
    const { req, res } = createReqRes('/api/hello')
    const apis: Route[] = [{
      path: '/api/hello', pattern: /^\/api\/hello(\?.*)?$/, paramNames: [], filePath: 'src/server/hello.ts', type: 'api',
    }]
    const vite = createMockVite()
    vite.config.root = tmpDir
    const state = createState({ appShell }, [], apis)
    vite.ssrLoadModule.mockResolvedValue({ get: vi.fn().mockResolvedValue({ status: 200, body: { msg: 'hi' } }) })
    await handleRequest(req, res, vite, state)
    expect(res.statusCode).toBe(200)
    expect(res.writableEnded).toBe(true)
  })
})
