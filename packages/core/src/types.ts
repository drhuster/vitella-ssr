import type { IncomingMessage, ServerResponse } from 'http'
import type { Cookies } from './cookies.js'

export interface AdapterRenderResult {
  html: string
  head?: string
  title?: string
}

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

export interface Route {
  path: string
  pattern: RegExp
  paramNames: string[]
  filePath: string
  layout?: string
  type: 'page' | 'api'
}

export interface RouteManifest {
  pages: Route[]
  apis: Route[]
}

export interface RequestContext {
  params: Record<string, string>
  query: Record<string, string>
  cookies: Cookies
}

export interface PageLoadContext extends RequestContext {
  req: IncomingMessage
}

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
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

export interface ApiHandlerModule {
  get?: (req: IncomingMessage, res: ServerResponse, ctx: RequestContext) => Promise<{ status: number; body: unknown }> | { status: number; body: unknown }
  post?: (req: IncomingMessage, res: ServerResponse, ctx: RequestContext) => Promise<{ status: number; body: unknown }> | { status: number; body: unknown }
  put?: (req: IncomingMessage, res: ServerResponse, ctx: RequestContext) => Promise<{ status: number; body: unknown }> | { status: number; body: unknown }
  del?: (req: IncomingMessage, res: ServerResponse, ctx: RequestContext) => Promise<{ status: number; body: unknown }> | { status: number; body: unknown }
  patch?: (req: IncomingMessage, res: ServerResponse, ctx: RequestContext) => Promise<{ status: number; body: unknown }> | { status: number; body: unknown }
}

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
