import type { IncomingMessage, ServerResponse } from 'http'
import { Cookies } from './cookies.js'

export interface RequestContext {
  params: Record<string, string>
  query: Record<string, string>
  cookies: Cookies
}

export function parseRequestContext(req: IncomingMessage, params: Record<string, string>): RequestContext {
  const url = req.url || '/'
  const queryString = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : ''
  const query = Object.fromEntries(new URLSearchParams(queryString))
  const cookies = new Cookies(req.headers.cookie)
  return { params, query, cookies }
}

export function flushCookies(res: ServerResponse, cookies: Cookies): void {
  const headers = cookies.toSetCookieHeaders()
  for (const header of headers) {
    res.appendHeader('Set-Cookie', header)
  }
  cookies.clear()
}
