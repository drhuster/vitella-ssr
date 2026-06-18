import { createPinia } from 'pinia'
import type { Pinia } from 'pinia'

export function createPiniaSSR(): {
  pinia: Pinia
  serialize: () => Record<string, unknown>
} {
  const pinia = createPinia()

  function serialize(): Record<string, unknown> {
    const state: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(pinia.state.value)) {
      state[key] = value
    }
    return state
  }

  return { pinia, serialize }
}
