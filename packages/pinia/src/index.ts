/**
 * @vitella-ssr/pinia — Pinia state management integration for Vitella SSR.
 *
 * Provides server-side Pinia creation (with serialization), client-side
 * hydration from window.__INITIAL_STATE__, and a combined Vue+Pinia adapter.
 */

export { createPiniaSSR } from './server.js'
export { hydratePinia } from './client.js'
export { piniaVueAdapter } from './adapter.js'
