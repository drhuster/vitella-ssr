import { describe, it, expect } from 'vitest'
import { vitellaPlugin } from '../src/index.js'

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
