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
})
