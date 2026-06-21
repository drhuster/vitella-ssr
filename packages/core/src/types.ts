/**
 * Core type definitions for Vitella SSR.
 *
 * These types define the contracts between the framework core, adapters,
 * page/API route modules, and the build pipeline.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import type { Cookies } from './cookies.js'

/** Result returned by an adapter's render function — either raw HTML or a structured result with head/title metadata. */
export interface AdapterRenderResult {
  html: string
  head?: string
  title?: string
}

/**
 * An adapter bridges Vitella's framework-agnostic core with a specific UI framework (Vue, React, etc.).
 * It defines the file extensions to scan, how to render a component to HTML, and how to generate
 * client-side hydration code.
 */
export interface Adapter {
  name: string
  extensions: string[]
  render: (options: {
    page: string
    component: any
    layout?: any
    loadData: Record<string, unknown>
    req: IncomingMessage
    res: ServerResponse
  }) => string | Promise<string | AdapterRenderResult>
  getClientEntry?: (page: string, pagePath: string, layout?: string) => string
}

/** A single route discovered from the filesystem — either a page or an API endpoint. */
export interface Route {
  path: string
  pattern: RegExp
  paramNames: string[]
  filePath: string
  layout?: string
  type: 'page' | 'api'
}

/** Complete route collection for an application, including the optional error page. */
export interface RouteManifest {
  pages: Route[]
  apis: Route[]
  errorPage?: ErrorPageInfo
}

/** Metadata about a custom error page (_error file) found in the pages directory. */
export interface ErrorPageInfo {
  filePath: string
  layout?: string
}

/** Per-request context extracted from the HTTP request — URL params, query string, cookies. */
export interface RequestContext {
  params: Record<string, string>
  query: Record<string, string>
  cookies: Cookies
}

/** Extended context passed to a page module's load() function, also includes the raw request. */
export interface PageLoadContext extends RequestContext {
  req: IncomingMessage
}

/** User-facing configuration for the Vitella framework. */
export interface VitellaConfig {
  middleware?: Array<
    (req: IncomingMessage, res: ServerResponse, next: () => Promise<void>) => void | Promise<void>
  >
  appShell?: string
  adapter?: Adapter
  pagesDir?: string
  serverDir?: string
  assetsDir?: string
  ttl?: {
    images?: number
    pages?: number
  }
  securityHeaders?: Record<string, string>
}

/** Supported HTTP methods for API route handlers. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

/** Shape of an API route module — each method handler receives the request and context, returns a status+body response. */
export interface ApiHandlerModule {
  get?: (req: IncomingMessage, res: ServerResponse, ctx: RequestContext) => Promise<{ status: number; body: unknown }> | { status: number; body: unknown }
  post?: (req: IncomingMessage, res: ServerResponse, ctx: RequestContext) => Promise<{ status: number; body: unknown }> | { status: number; body: unknown }
  put?: (req: IncomingMessage, res: ServerResponse, ctx: RequestContext) => Promise<{ status: number; body: unknown }> | { status: number; body: unknown }
  del?: (req: IncomingMessage, res: ServerResponse, ctx: RequestContext) => Promise<{ status: number; body: unknown }> | { status: number; body: unknown }
  patch?: (req: IncomingMessage, res: ServerResponse, ctx: RequestContext) => Promise<{ status: number; body: unknown }> | { status: number; body: unknown }
}

/** Build output manifest — maps page/API route paths to their compiled client and server entry files. */
export interface BuildManifest {
  pages: Record<string, {
    clientEntry: string
    serverEntry: string
    css?: string[]
  }>
  apis: Record<string, {
    serverEntry: string
  }>
}
