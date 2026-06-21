/**
 * Cookie parsing, serialization, and management.
 *
 * Provides a Cookies class with buffered outgoing writes (collected during
 * request handling, flushed at response time), and utilities for building
 * Set-Cookie headers with standard cookie attributes.
 */

export interface CookieOptions {
  maxAge?: number
  expires?: Date
  path?: string
  domain?: string
  secure?: boolean
  httpOnly?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
}

/** Serialize a cookie name/value pair with options into a Set-Cookie header string. */
export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const encoded = encodeURIComponent(value)
  const parts: string[] = [`${name}=${encoded}`]

  if (typeof options.maxAge === 'number' && Number.isFinite(options.maxAge)) {
    parts.push(`Max-Age=${Math.trunc(options.maxAge)}`)
  }

  parts.push(`Path=${options.path ?? '/'}`)

  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`)
  }

  if (options.httpOnly) parts.push('HttpOnly')
  if (options.secure) parts.push('Secure')
  if (options.domain) parts.push(`Domain=${options.domain}`)
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`)
    // SameSite=None requires Secure per spec.
    if (options.sameSite === 'None' && !options.secure) {
      parts.push('Secure')
    }
  }

  return parts.join('; ')
}

/**
 * Buffered cookie jar — reads incoming cookies and collects outgoing
 * Set-Cookie headers for flushing at response time.
 */
export class Cookies {
  private incoming: Record<string, string>
  private outgoing: Map<string, string> = new Map()

  constructor(cookieHeader?: string) {
    this.incoming = parseCookieHeader(cookieHeader)
  }

  /** Read a cookie value from the incoming request. */
  get(name: string): string | undefined {
    return this.incoming[name]
  }

  /** Get all incoming cookies as a plain object. */
  getAll(): Record<string, string> {
    return { ...this.incoming }
  }

  /** Set a cookie to be sent in the response. Buffered until flushCookies() is called. */
  set(name: string, value: string, options: CookieOptions = {}): void {
    this.outgoing.set(name, serializeCookie(name, value, options))
  }

  /** Get all buffered Set-Cookie header strings. */
  toSetCookieHeaders(): string[] {
    return Array.from(this.outgoing.values())
  }

  /** Clear the outgoing cookie buffer. */
  clear(): void {
    this.outgoing.clear()
  }
}

/** Parse a raw Cookie header string into a key/value map. Gracefully handles malformed pairs. */
function parseCookieHeader(header?: string): Record<string, string> {
  if (!header) return {}
  const result: Record<string, string> = {}
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=')
    if (idx === -1) {
      const name = pair.trim()
      if (name) result[name] = ''
    } else {
      const name = pair.slice(0, idx).trim()
      const value = pair.slice(idx + 1).trim()
      if (name) {
        try {
          result[name] = decodeURIComponent(value)
        } catch {
          result[name] = value
        }
      }
    }
  }
  return result
}
