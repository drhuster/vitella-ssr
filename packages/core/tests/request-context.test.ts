import { describe, it, expect } from 'vitest'
import { IncomingMessage } from 'http'
import { Socket } from 'net'
import { parseRequestContext, flushCookies } from '../src/request-context.js'
import { Cookies } from '../src/cookies.js'

function mockReq(url?: string, cookieHeader?: string): IncomingMessage {
  const req = new IncomingMessage(new Socket())
  if (url) req.url = url
  if (cookieHeader !== undefined) req.headers.cookie = cookieHeader
  return req
}

describe('parseRequestContext', () => {
  it('extracts route params as-is', () => {
    const ctx = parseRequestContext(mockReq('/'), { slug: 'hello' })
    expect(ctx.params).toEqual({ slug: 'hello' })
  })

  it('parses query string into an object', () => {
    const ctx = parseRequestContext(mockReq('/path?a=1&b=2'), {})
    expect(ctx.query).toEqual({ a: '1', b: '2' })
  })

  it('returns empty query when no ? is present', () => {
    const ctx = parseRequestContext(mockReq('/path'), {})
    expect(ctx.query).toEqual({})
  })

  it('strips hash from URL before parsing query', () => {
    const ctx = parseRequestContext(mockReq('/path?a=1#section'), {})
    expect(ctx.query).toEqual({ a: '1' })
  })

  it('populates cookies from the request header', () => {
    const ctx = parseRequestContext(mockReq('/', 'foo=bar; baz=qux'), {})
    expect(ctx.cookies.get('foo')).toBe('bar')
    expect(ctx.cookies.get('baz')).toBe('qux')
  })

  it('returns empty cookies when no cookie header is present', () => {
    const ctx = parseRequestContext(mockReq('/'), {})
    expect(ctx.cookies.getAll()).toEqual({})
  })

  it('params and query are independent records', () => {
    const ctx = parseRequestContext(mockReq('/blog/hello?page=2'), { slug: 'hello' })
    expect(ctx.params).toEqual({ slug: 'hello' })
    expect(ctx.query).toEqual({ page: '2' })
  })

  it('combines params, query, and cookies in one call', () => {
    const ctx = parseRequestContext(mockReq('/u/42?tab=info', 'session=abc'), { id: '42' })
    expect(ctx.params).toEqual({ id: '42' })
    expect(ctx.query).toEqual({ tab: 'info' })
    expect(ctx.cookies.get('session')).toBe('abc')
  })
})

describe('flushCookies', () => {
  it('appends Set-Cookie headers to the response', () => {
    const headers: Record<string, string | string[] | undefined> = {}
    const res = {
      appendHeader(name: string, value: string | string[]) {
        const existing = headers[name]
        if (existing === undefined) headers[name] = value
        else if (Array.isArray(existing)) existing.push(...(Array.isArray(value) ? value : [value]))
        else if (Array.isArray(value)) headers[name] = [existing, ...value]
        else headers[name] = [existing, value]
      },
      getHeader(name: string) { return headers[name] },
    } as any

    const cookies = new Cookies()
    cookies.set('a', '1')
    cookies.set('b', '2')
    flushCookies(res, cookies)
    expect(res.getHeader('Set-Cookie')).toEqual(['a=1; Path=/', 'b=2; Path=/'])
  })

  it('clears the cookie buffer after flushing', () => {
    const res = { appendHeader() {} } as any
    const cookies = new Cookies()
    cookies.set('a', '1')
    flushCookies(res, cookies)
    expect(cookies.toSetCookieHeaders()).toEqual([])
  })

  it('does nothing when no cookies are set', () => {
    let called = false
    const res = {
      appendHeader() { called = true },
    } as any
    flushCookies(res, new Cookies())
    expect(called).toBe(false)
  })
})
