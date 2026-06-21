/**
 * Client-side Pinia hydration for Vitella SSR.
 *
 * Creates a Pinia instance and hydrates it with the state serialized
 * during SSR and stored in window.__INITIAL_STATE__.pinia.
 */

import { createPinia, type StateTree } from 'pinia'

/** Create and hydrate a Pinia instance from server-serialized state, with prototype pollution protection. */
export function hydratePinia(): ReturnType<typeof createPinia> {
  const pinia = createPinia()

  if (typeof window !== 'undefined' && (window as any).__INITIAL_STATE__?.pinia) {
    const state = (window as any).__INITIAL_STATE__.pinia as Record<string, StateTree>
    for (const [key, value] of Object.entries(state)) {
      if (key === '__proto__' || key === 'constructor') continue
      pinia.state.value[key] = value
    }
  }

  return pinia
}
