import { describe, it, expect, vi, beforeEach } from 'vitest'
import { vitellaPlugin } from '../src/index.js'

vi.mock('../src/config.js', () => ({
  resolveConfig: vi.fn(),
}))

vi.mock('../src/route-manifest.js', () => ({
  buildRouteManifest: vi.fn(),
}))

import { resolveConfig } from '../src/config.js'
import { buildRouteManifest } from '../src/route-manifest.js'

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
