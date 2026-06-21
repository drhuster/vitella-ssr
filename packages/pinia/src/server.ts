/**
 * Server-side Pinia creation for Vitella SSR.
 *
 * Creates a fresh Pinia instance per request and provides a serialize()
 * function that extracts all store state for injection into the HTML shell.
 */

import { createPinia } from 'pinia'
import type { Pinia } from 'pinia'

/** Create a Pinia instance with a serialize() function to capture all store state for the HTML response. */
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
