import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { hydratePinia } from '../src/client.js'

describe('hydratePinia', () => {
  const originalWindow = (globalThis as any).window

  beforeEach(() => {
    delete (globalThis as any).window
  })

  afterEach(() => {
    (globalThis as any).window = originalWindow
  })

  it('creates a pinia instance', () => {
    const pinia = hydratePinia()
    expect(pinia.state.value).toBeDefined()
  })

  it('hydrates state from window.__INITIAL_STATE__.pinia when available', () => {
    ;(globalThis as any).window = {
      __INITIAL_STATE__: {
        pinia: {
          cart: { items: ['a'] },
          auth: { user: { name: 'Alice' } },
        },
      },
    }

    const pinia = hydratePinia()
    expect(pinia.state.value.cart).toEqual({ items: ['a'] })
    expect(pinia.state.value.auth).toEqual({ user: { name: 'Alice' } })
  })

  it('handles missing __INITIAL_STATE__ gracefully', () => {
    ;(globalThis as any).window = {}

    const pinia = hydratePinia()
    expect(pinia.state.value).toEqual({})
  })

  it('handles missing pinia key in __INITIAL_STATE__ gracefully', () => {
    ;(globalThis as any).window = {
      __INITIAL_STATE__: { something: 'else' },
    }

    const pinia = hydratePinia()
    expect(pinia.state.value).toEqual({})
  })
})
