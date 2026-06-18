import { describe, it, expect } from 'vitest'
import { createPiniaSSR } from '../src/server.js'

describe('createPiniaSSR', () => {
  it('creates a pinia instance', () => {
    const { pinia } = createPiniaSSR()
    expect(pinia.state.value).toBeDefined()
  })

  it('serializes store state', () => {
    const { pinia, serialize } = createPiniaSSR()
    pinia.state.value.test = { count: 42 }
    const state = serialize()
    expect(state.test).toEqual({ count: 42 })
  })

  it('returns empty state when no stores used', () => {
    const { serialize } = createPiniaSSR()
    expect(serialize()).toEqual({})
  })

  it('serializes multiple store states', () => {
    const { pinia, serialize } = createPiniaSSR()
    pinia.state.value.users = { items: [] }
    pinia.state.value.auth = { user: null }
    const state = serialize()
    expect(state.users).toEqual({ items: [] })
    expect(state.auth).toEqual({ user: null })
  })
})
