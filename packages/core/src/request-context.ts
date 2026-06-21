/**
 * Request context parsing and body reading utilities.
 *
 * Extracts URL params, query string, cookies from the incoming request.
 * Provides a streaming body reader with a configurable size limit.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { Cookies } from './cookies.js'

export interface RequestContext {
  params: Record<string, string>
  query: Record<string, string>
  cookies: Cookies
}

/** Parse URL params, query string, and cookies from the incoming request. */
export function parseRequestContext(req: IncomingMessage, params: Record<string, string>): RequestContext {
  const url = req.url || '/'
  const queryString = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : ''
  const query = Object.fromEntries(new URLSearchParams(queryString))
  const cookies = new Cookies(req.headers.cookie)
  return { params, query, cookies }
}

/** Write all buffered Set-Cookie headers to the response and clear the outgoing cookie buffer. */
export function flushCookies(res: ServerResponse, cookies: Cookies): void {
  const headers = cookies.toSetCookieHeaders()
  for (const header of headers) {
    res.appendHeader('Set-Cookie', header)
  }
  cookies.clear()
}

/** Default maximum request body size: 10 MB. */
export const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024

/** Error thrown when the request body exceeds the configured size limit. */
export class BodyTooLargeError extends Error {
  constructor(public readonly maxSize: number) {
    super(`Request body exceeds maximum size of ${maxSize} bytes`)
    this.name = 'BodyTooLargeError'
  }
}

/** Read the full request body as a string, enforcing a configurable size limit. */
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
