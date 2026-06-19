import { describe, it, expect } from 'vitest'
import { resolveConfig } from '../src/config.js'

describe('resolveConfig', () => {
  it('returns default values when no config', async () => {
    const config = await resolveConfig()
    expect(config.pagesDir).toBe('src/pages')
    expect(config.serverDir).toBe('src/server')
    expect(config.appShell).toBe('src/app.html')
    expect(config.middleware).toEqual([])
  })

  it('merges user-provided config values', async () => {
    const config = await resolveConfig({ pagesDir: 'custom/pages', serverDir: 'custom/api' })
    expect(config.pagesDir).toBe('custom/pages')
    expect(config.serverDir).toBe('custom/api')
    expect(config.appShell).toBe('src/app.html')
  })

  it('preserves adapter when provided', async () => {
    const mockAdapter = { name: 'test', extensions: ['.test'], render: async () => '' }
    const config = await resolveConfig({ adapter: mockAdapter })
    expect(config.adapter).toBe(mockAdapter)
  })

  it('adapter is undefined when not provided', async () => {
    const config = await resolveConfig()
    expect(config.adapter).toBeUndefined()
  })

  it('defaults assetsDir to src/assets', async () => {
    const config = await resolveConfig()
    expect(config.assetsDir).toBe('src/assets')
  })

  it('overrides assetsDir when provided', async () => {
    const config = await resolveConfig({ assetsDir: 'static' })
    expect(config.assetsDir).toBe('static')
  })
})
