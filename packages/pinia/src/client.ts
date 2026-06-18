import { createPinia, type StateTree } from 'pinia'

export function hydratePinia(): ReturnType<typeof createPinia> {
  const pinia = createPinia()

  if (typeof window !== 'undefined' && (window as any).__INITIAL_STATE__?.pinia) {
    const state = (window as any).__INITIAL_STATE__.pinia as Record<string, StateTree>
    for (const [key, value] of Object.entries(state)) {
      pinia.state.value[key] = value
    }
  }

  return pinia
}
