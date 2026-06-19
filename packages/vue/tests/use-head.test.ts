import { describe, it, expect } from 'vitest'

describe('useHead', () => {
  it('exports useHead as a function', async () => {
    const mod = await import('../src/use-head.js')
    expect(typeof mod.useHead).toBe('function')
  })
})
