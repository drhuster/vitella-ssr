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

export const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024

export class BodyTooLargeError extends Error {
  constructor(public readonly maxSize: number) {
    super(`Request body exceeds maximum size of ${maxSize} bytes`)
    this.name = 'BodyTooLargeError'
  }
}

export async function readBody(
  req: IncomingMessage,
  maxSize: number = DEFAULT_MAX_BODY_SIZE
): Promise<string> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    total += buf.length
    if (total > maxSize) {
      chunks.length = 0
      throw new BodyTooLargeError(maxSize)
    }
    chunks.push(buf)
  }
  return Buffer.concat(chunks).toString('utf-8')
}
