/**
 * Vue 3 composable for managing HTML <head> metadata during SSR.
 *
 * Uses Vue's SSR context (Symbol.for('v-scx')) to inject title, meta,
 * and link tags that are collected during renderToString and returned
 * as part of the structured adapter render result.
 */

import { inject } from 'vue'

const SSR_CONTEXT_KEY = Symbol.for('v-scx')

export interface HeadAttrs {
  title?: string
  meta?: Array<{
    charset?: string
    name?: string
    property?: string
    content?: string
  }>
  link?: Array<{
    rel: string
    href: string
  }>
}

/** Injects head metadata into the Vue SSR context for extraction during render. */
export function useHead(options: HeadAttrs) {
  const ctx = inject<{ head?: HeadAttrs } | null>(SSR_CONTEXT_KEY, null)
  if (!ctx) return

  if (!ctx.head) {
    ctx.head = {}
  }

  if (options.title !== undefined) {
    ctx.head.title = options.title
  }
  if (options.meta) {
    ctx.head.meta = options.meta
  }
  if (options.link) {
    ctx.head.link = options.link
  }
}
