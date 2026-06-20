export interface CookieOptions {
  maxAge?: number
  expires?: Date
  path?: string
  domain?: string
  secure?: boolean
  httpOnly?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
}

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
    if (options.sameSite === 'None' && !options.secure) {
      parts.push('Secure')
    }
  }

  return parts.join('; ')
}

export class Cookies {
  private incoming: Record<string, string>
  private outgoing: Map<string, string> = new Map()

  constructor(cookieHeader?: string) {
    this.incoming = parseCookieHeader(cookieHeader)
  }

  get(name: string): string | undefined {
    return this.incoming[name]
  }

  getAll(): Record<string, string> {
    return { ...this.incoming }
  }

  set(name: string, value: string, options: CookieOptions = {}): void {
    this.outgoing.set(name, serializeCookie(name, value, options))
  }

  toSetCookieHeaders(): string[] {
    return Array.from(this.outgoing.values())
  }

  clear(): void {
    this.outgoing.clear()
  }
}

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
      if (name) result[name] = value
    }
  }
  return result
}
