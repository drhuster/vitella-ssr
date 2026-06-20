import { describe, it, expect, vi, beforeEach } from 'vitest'
import { vitellaPlugin } from '../src/index.js'

vi.mock('../src/config.js', () => ({
  resolveConfig: vi.fn(),
}))

vi.mock('../src/route-manifest.js', () => ({
  buildRouteManifest: vi.fn(),
}))

vi.mock('../src/dev-server.js', () => ({
  handleRequest: vi.fn(),
  DevServerState: {} as any,
}))

import { resolveConfig } from '../src/config.js'
import { buildRouteManifest } from '../src/route-manifest.js'
import { handleRequest } from '../src/dev-server.js'
import fs from 'fs'

describe('vitellaPlugin hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveConfig).mockResolvedValue({
      pagesDir: 'src/pages',
      serverDir: 'src/server',
      adapter: null,
      middleware: [],
      appShell: 'app.html',
      assetsDir: 'public',
      ttl: {},
    })
    vi.mocked(buildRouteManifest).mockReturnValue({ pages: [], apis: [] })
  })

  it('config hook returns appType custom', () => {
    const plugin = vitellaPlugin()
    expect(plugin.config()).toEqual({ appType: 'custom' })
  })

  it('configResolved hook sets up state with manifest and config', async () => {
    const plugin = vitellaPlugin({}) as any
    await plugin.configResolved({ root: '/fake' })
    expect(resolveConfig).toHaveBeenCalled()
    expect(buildRouteManifest).toHaveBeenCalled()
  })

  it('configResolved resolves root from config.root', async () => {
    const plugin = vitellaPlugin({}) as any
    await plugin.configResolved({ root: '/custom-root' })
    expect(buildRouteManifest).toHaveBeenCalled()
  })
})

describe('resolveId', () => {
  it('returns the virtual ID for vitella:client-entry: prefix', () => {
    const plugin = vitellaPlugin() as any
    const resolved = plugin.resolveId('vitella:client-entry:/src/pages/index.vue')
    expect(resolved).toBe('\0vitella:client-entry:/src/pages/index.vue')
  })

  it('passes through already resolved \\0-prefixed ID', () => {
    const plugin = vitellaPlugin() as any
    const resolved = plugin.resolveId('\0vitella:client-entry:/src/pages/index.vue')
    expect(resolved).toBe('\0vitella:client-entry:/src/pages/index.vue')
  })

  it('returns null for non-virtual modules', () => {
    const plugin = vitellaPlugin() as any
    expect(plugin.resolveId('./normal-module.js')).toBeNull()
    expect(plugin.resolveId('fs')).toBeNull()
    expect(plugin.resolveId('/absolute/path.js')).toBeNull()
  })
})

describe('load', () => {
  it('returns null for non-virtual module IDs', () => {
    const plugin = vitellaPlugin() as any
    expect(plugin.load('./normal.js')).toBeNull()
    expect(plugin.load('/absolute/path.js')).toBeNull()
  })

  it('returns null when no adapter provides getClientEntry', async () => {
    const plugin = vitellaPlugin() as any
    await plugin.configResolved({ root: '/fake' })
    const result = plugin.load('\0vitella:client-entry:src/pages/index.vue')
    expect(result).toBeNull()
  })

  it('calls adapter.getClientEntry for virtual modules when adapter provides it', async () => {
    const getClientEntry = vi.fn((_id: string, _pagePath: string, _layout?: string) => 'export const render = () => null')
    vi.mocked(resolveConfig).mockResolvedValue({
      pagesDir: 'src/pages',
      serverDir: 'src/server',
      adapter: { name: 'test', extensions: ['.vue'], getClientEntry },
      middleware: [],
      appShell: 'app.html',
      assetsDir: 'public',
      ttl: {},
    })
    const filePath = 'src/pages/index.vue'
    vi.mocked(buildRouteManifest).mockReturnValue({
      pages: [{ filePath, path: '/', paramNames: [], type: 'page', pattern: /^\// }],
      apis: [],
    })
    const plugin = vitellaPlugin() as any
    await plugin.configResolved({ root: '/fake' })
    const result = plugin.load(`\0vitella:client-entry:${filePath}`)
    expect(getClientEntry).toHaveBeenCalledWith(`\0vitella:client-entry:${filePath}`, filePath, undefined)
    expect(result).toBe('export const render = () => null')
  })

  it('passes route layout to getClientEntry when route has layout', async () => {
    const getClientEntry = vi.fn()
    vi.mocked(resolveConfig).mockResolvedValue({
      pagesDir: 'src/pages',
      serverDir: 'src/server',
      adapter: { name: 'test', extensions: ['.vue'], getClientEntry },
      middleware: [],
      appShell: 'app.html',
      assetsDir: 'public',
      ttl: {},
    })
    const filePath = 'src/pages/dashboard.vue'
    vi.mocked(buildRouteManifest).mockReturnValue({
      pages: [{ filePath, path: '/dashboard', paramNames: [], type: 'page', pattern: /^\/dashboard/, layout: 'src/layouts/dashboard.vue' }],
      apis: [],
    })
    const plugin = vitellaPlugin() as any
    await plugin.configResolved({ root: '/fake' })
    plugin.load(`\0vitella:client-entry:${filePath}`)
    expect(getClientEntry).toHaveBeenCalledWith(`\0vitella:client-entry:${filePath}`, filePath, 'src/layouts/dashboard.vue')
  })
})

describe('configureServer', () => {
  it('registers middleware and returns SSR middleware function', () => {
    const plugin = vitellaPlugin() as any
    const server = {
      middlewares: { use: vi.fn() },
      config: { root: '/fake' },
    }
    const result = plugin.configureServer(server)
    expect(server.middlewares.use).toHaveBeenCalledTimes(1)
    expect(typeof result).toBe('function')
  })
})

describe('buildStart', () => {
  it('rebuilds manifest when state has been initialized', async () => {
    const plugin = vitellaPlugin() as any
    await plugin.configResolved({ root: '/fake' })
    vi.mocked(buildRouteManifest).mockClear()
    plugin.buildStart()
    expect(buildRouteManifest).toHaveBeenCalled()
  })

  it('does nothing when state is not set', () => {
    vi.mocked(buildRouteManifest).mockClear()
    const plugin = vitellaPlugin() as any
    plugin.buildStart()
    expect(buildRouteManifest).not.toHaveBeenCalled()
  })
})

describe('asset middleware', () => {
  async function setupAssetMiddleware(configOverrides = {}) {
    vi.clearAllMocks()
    vi.mocked(resolveConfig).mockResolvedValue({
      pagesDir: 'src/pages',
      serverDir: 'src/server',
      adapter: null,
      middleware: [],
      appShell: 'app.html',
      assetsDir: 'public',
      ttl: {},
      ...configOverrides,
    })
    vi.mocked(buildRouteManifest).mockReturnValue({ pages: [], apis: [] })

    const plugin = vitellaPlugin() as any
    await plugin.configResolved({ root: '/fake' })

    const server = {
      middlewares: { use: vi.fn() },
      config: { root: '/fake' },
    }
    plugin.configureServer(server)
    return server.middlewares.use.mock.calls[0][0] as Function
  }

  it('calls next() for URLs not starting with /assets/', async () => {
    const mw = await setupAssetMiddleware()
    const req = { url: '/some-page' }
    const res = { statusCode: 200, end: vi.fn(), setHeader: vi.fn() }
    const next = vi.fn()
    await mw(req, res, next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('blocks path traversal with 403', async () => {
    const mw = await setupAssetMiddleware()
    const req = { url: '/assets/../../secret.txt' }
    const res = { statusCode: 200, end: vi.fn(), setHeader: vi.fn() }
    const next = vi.fn()
    await mw(req, res, next)
    expect(res.statusCode).toBe(403)
    expect(res.end).toHaveBeenCalledWith('Forbidden')
    expect(next).not.toHaveBeenCalled()
  })

  it('serves existing assets with correct MIME type', async () => {
    const mw = await setupAssetMiddleware()
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true } as any)
    const mockStream = { on: vi.fn().mockReturnThis(), pipe: vi.fn().mockReturnThis() }
    vi.spyOn(fs, 'createReadStream').mockReturnValue(mockStream as any)

    const req = { url: '/assets/styles.css' }
    const res = { statusCode: 200, end: vi.fn(), setHeader: vi.fn() }
    const next = vi.fn()
    await mw(req, res, next)

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/css')
    expect(fs.createReadStream).toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it('sets Cache-Control header for images when ttl.images is configured', async () => {
    const mw = await setupAssetMiddleware({ ttl: { images: 3600 } })
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true } as any)
    const mockStream = { on: vi.fn().mockReturnThis(), pipe: vi.fn().mockReturnThis() }
    vi.spyOn(fs, 'createReadStream').mockReturnValue(mockStream as any)

    const req = { url: '/assets/logo.png' }
    const res = { statusCode: 200, end: vi.fn(), setHeader: vi.fn() }
    await mw(req, res, vi.fn())

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png')
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=3600')
  })

  it('returns 500 when asset stream errors', async () => {
    const mw = await setupAssetMiddleware()
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true } as any)

    let errorHandler: Function
    const mockStream = {
      on: vi.fn((event: string, handler: Function) => {
        if (event === 'error') errorHandler = handler
        return mockStream
      }),
      pipe: vi.fn().mockReturnThis(),
    }
    vi.spyOn(fs, 'createReadStream').mockReturnValue(mockStream as any)

    const req = { url: '/assets/styles.css' }
    const res = { statusCode: 200, end: vi.fn(), setHeader: vi.fn() }
    await mw(req, res, vi.fn())

    errorHandler(new Error('stream failed'))
    expect(res.statusCode).toBe(500)
    expect(res.end).toHaveBeenCalledWith('Internal Server Error')
  })

  it('calls next() when asset file does not exist', async () => {
    const mw = await setupAssetMiddleware()
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)

    const req = { url: '/assets/missing.js' }
    const res = { statusCode: 200, end: vi.fn(), setHeader: vi.fn() }
    const next = vi.fn()
    await mw(req, res, next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('uses application/octet-stream for unknown file extensions', async () => {
    const mw = await setupAssetMiddleware()
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true } as any)
    const mockStream = { on: vi.fn().mockReturnThis(), pipe: vi.fn().mockReturnThis() }
    vi.spyOn(fs, 'createReadStream').mockReturnValue(mockStream as any)

    const req = { url: '/assets/file.xyz' }
    const res = { statusCode: 200, end: vi.fn(), setHeader: vi.fn() }
    await mw(req, res, vi.fn())

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream')
  })
})

describe('SSR middleware', () => {
  async function setupSsrMiddleware(manifestOverrides: any = {}) {
    vi.clearAllMocks()
    vi.mocked(resolveConfig).mockResolvedValue({
      pagesDir: 'src/pages',
      serverDir: 'src/server',
      adapter: null,
      middleware: [],
      appShell: 'app.html',
      assetsDir: 'public',
      ttl: {},
    })
    vi.mocked(buildRouteManifest).mockReturnValue({
      pages: [],
      apis: [],
      ...manifestOverrides,
    })

    const plugin = vitellaPlugin() as any
    await plugin.configResolved({ root: '/fake' })

    const server = {
      middlewares: { use: vi.fn() },
      config: { root: '/fake' },
    }
    const postMiddleware = plugin.configureServer(server) as Function
    postMiddleware()
    return server.middlewares.use.mock.calls[1][0] as Function
  }

  it('skips Vite internal /@ paths', async () => {
    const mw = await setupSsrMiddleware()
    const req = { url: '/@vite/client' }
    const res = {}
    const next = vi.fn()
    await mw(req, res, next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('skips Vite internal /__ paths', async () => {
    const mw = await setupSsrMiddleware()
    const req = { url: '/__open-in-editor' }
    const res = {}
    const next = vi.fn()
    await mw(req, res, next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('skips /node_modules/ paths', async () => {
    const mw = await setupSsrMiddleware()
    const req = { url: '/node_modules/vue/dist/vue.js' }
    const res = {}
    const next = vi.fn()
    await mw(req, res, next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('calls next() when URL does not match any page or API route', async () => {
    const mw = await setupSsrMiddleware({
      pages: [{ path: '/about', pattern: /^\/about/, filePath: 'src/pages/about.vue', paramNames: [], type: 'page' as const }],
    })
    const req = { url: '/unknown' }
    const res = {}
    const next = vi.fn()
    await mw(req, res, next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('calls handleRequest for matching page routes', async () => {
    const mw = await setupSsrMiddleware({
      pages: [{ path: '/about', pattern: /^\/about/, filePath: 'src/pages/about.vue', paramNames: [], type: 'page' as const }],
    })
    const req = { url: '/about' }
    const res = { statusCode: 200, end: vi.fn(), setHeader: vi.fn() }
    const next = vi.fn()
    await mw(req, res, next)
    expect(handleRequest).toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it('calls handleRequest for matching API routes', async () => {
    const mw = await setupSsrMiddleware({
      pages: [],
      apis: [{ path: '/api/hello', pattern: /^\/api\/hello/, filePath: 'src/server/hello.ts', paramNames: [], type: 'api' as const }],
    })
    const req = { url: '/api/hello' }
    const res = { statusCode: 200, end: vi.fn(), setHeader: vi.fn() }
    const next = vi.fn()
    await mw(req, res, next)
    expect(handleRequest).toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 500 when handleRequest throws', async () => {
    const mw = await setupSsrMiddleware({
      pages: [{ path: '/', pattern: /^\//, filePath: 'src/pages/index.vue', paramNames: [], type: 'page' as const }],
    })
    vi.mocked(handleRequest).mockRejectedValue(new Error('ssr failure'))

    const req = { url: '/' }
    const res = { statusCode: 200, end: vi.fn(), setHeader: vi.fn() }
    const next = vi.fn()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await mw(req, res, next)

    expect(res.statusCode).toBe(500)
    expect(res.end).toHaveBeenCalledWith('Internal Server Error')
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
