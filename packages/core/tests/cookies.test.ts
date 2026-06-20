import { describe, it, expect } from 'vitest'
import { Cookies, serializeCookie } from '../src/cookies.js'

describe('serializeCookie', () => {
  it('produces name=value with default Path=/', () => {
    expect(serializeCookie('foo', 'bar')).toBe('foo=bar; Path=/')
  })

  it('encodes value with special characters', () => {
    const result = serializeCookie('token', 'a b=c')
    expect(result).toBe('token=a%20b%3Dc; Path=/')
  })

  it('includes Max-Age when maxAge is finite', () => {
    expect(serializeCookie('foo', 'bar', { maxAge: 60 })).toBe('foo=bar; Max-Age=60; Path=/')
  })

  it('omits Max-Age when maxAge is undefined or non-finite', () => {
    expect(serializeCookie('foo', 'bar', { maxAge: undefined })).toBe('foo=bar; Path=/')
    expect(serializeCookie('foo', 'bar', { maxAge: Infinity })).toBe('foo=bar; Path=/')
  })

  it('formats Expires as UTC date string', () => {
    const date = new Date('2026-01-15T12:00:00Z')
    expect(serializeCookie('foo', 'bar', { expires: date })).toBe(`foo=bar; Path=/; Expires=${date.toUTCString()}`)
  })

  it('includes Secure flag when secure=true', () => {
    expect(serializeCookie('foo', 'bar', { secure: true })).toBe('foo=bar; Path=/; Secure')
  })

  it('includes HttpOnly flag when httpOnly=true', () => {
    expect(serializeCookie('foo', 'bar', { httpOnly: true })).toBe('foo=bar; Path=/; HttpOnly')
  })

  it('includes SameSite', () => {
    expect(serializeCookie('foo', 'bar', { sameSite: 'Strict' })).toBe('foo=bar; Path=/; SameSite=Strict')
    expect(serializeCookie('foo', 'bar', { sameSite: 'Lax' })).toBe('foo=bar; Path=/; SameSite=Lax')
  })

  it('auto-adds Secure when sameSite=None and secure not set', () => {
    expect(serializeCookie('foo', 'bar', { sameSite: 'None' })).toBe('foo=bar; Path=/; SameSite=None; Secure')
  })

  it('uses custom path when provided', () => {
    expect(serializeCookie('foo', 'bar', { path: '/api' })).toBe('foo=bar; Path=/api')
  })

  it('emits all flags in a single header', () => {
    const result = serializeCookie('foo', 'bar', {
      maxAge: 3600,
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    })
    expect(result).toBe('foo=bar; Max-Age=3600; Path=/; HttpOnly; Secure; SameSite=Lax')
  })
})

describe('Cookies', () => {
  it('reads request cookies from the constructor', () => {
    const c = new Cookies('foo=bar; baz=qux')
    expect(c.get('foo')).toBe('bar')
    expect(c.get('baz')).toBe('qux')
  })

  it('get returns undefined for missing cookies', () => {
    const c = new Cookies('foo=bar')
    expect(c.get('missing')).toBeUndefined()
  })

  it('getAll returns all cookies as a record', () => {
    const c = new Cookies('a=1; b=2; c=3')
    expect(c.getAll()).toEqual({ a: '1', b: '2', c: '3' })
  })

  it('handles empty cookie header', () => {
    const c = new Cookies('')
    expect(c.getAll()).toEqual({})
  })

  it('handles undefined cookie header', () => {
    const c = new Cookies()
    expect(c.getAll()).toEqual({})
  })

  it('trims whitespace around cookie names and values', () => {
    const c = new Cookies('  foo  =  bar  ; baz=qux ')
    expect(c.get('foo')).toBe('bar')
    expect(c.get('baz')).toBe('qux')
  })

  it('set buffers a Set-Cookie header', () => {
    const c = new Cookies()
    c.set('foo', 'bar', { httpOnly: true })
    expect(c.toSetCookieHeaders()).toEqual(['foo=bar; Path=/; HttpOnly'])
  })

  it('multiple set calls produce multiple headers', () => {
    const c = new Cookies()
    c.set('a', '1')
    c.set('b', '2')
    expect(c.toSetCookieHeaders()).toEqual(['a=1; Path=/', 'b=2; Path=/'])
  })

  it('setting the same name twice keeps only the last value', () => {
    const c = new Cookies()
    c.set('foo', 'first')
    c.set('foo', 'second')
    expect(c.toSetCookieHeaders()).toEqual(['foo=second; Path=/'])
  })

  it('clear empties the buffer', () => {
    const c = new Cookies()
    c.set('foo', 'bar')
    c.clear()
    expect(c.toSetCookieHeaders()).toEqual([])
  })
})
