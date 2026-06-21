import { describe, it, expect } from 'vitest'
import { matchRoute } from '../src/route-matcher.js'
import type { Route } from '../src/types.js'

describe('matchRoute', () => {
  const routes: Route[] = [
    {
      path: '/',
      pattern: /^\/(\?.*)?$/,
      paramNames: [],
      filePath: 'index.vue',
      type: 'page',
    },
    {
      path: '/about',
      pattern: /^\/about(\?.*)?$/,
      paramNames: [],
      filePath: 'about.vue',
      type: 'page',
    },
    {
      path: '/blog/:slug',
      pattern: /^\/blog\/([^/]+)(\?.*)?$/,
      paramNames: ['slug'],
      filePath: 'blog.vue',
      type: 'page',
    },
    {
      path: '/users/:id',
      pattern: /^\/users\/([^/]+)(\?.*)?$/,
      paramNames: ['id'],
      filePath: 'users.vue',
      type: 'page',
    },
  ]

  it('matches static route', () => {
    const result = matchRoute('/about', routes)
    expect(result).toBeTruthy()
    expect(result!.route.path).toBe('/about')
    expect(result!.params).toEqual({})
  })

  it('matches root route', () => {
    const result = matchRoute('/', routes)
    expect(result).toBeTruthy()
    expect(result!.route.path).toBe('/')
  })

  it('matches dynamic route and extracts params', () => {
    const result = matchRoute('/blog/hello-world', routes)
    expect(result).toBeTruthy()
    expect(result!.route.path).toBe('/blog/:slug')
    expect(result!.params).toEqual({ slug: 'hello-world' })
  })

  it('returns null for unmatched route', () => {
    const result = matchRoute('/nonexistent', routes)
    expect(result).toBeNull()
  })

  it('returns first match when multiple routes match (caller sorts by priority)', () => {
    const mixedRoutes: Route[] = [
      {
        path: '/about',
        pattern: /^\/about(\?.*)?$/,
        paramNames: [],
        filePath: 'about.vue',
        type: 'page',
      },
      {
        path: '/:slug',
        pattern: /^\/([^/]+)(\?.*)?$/,
        paramNames: ['slug'],
        filePath: 'catchall.vue',
        type: 'page',
      },
    ]
    const result = matchRoute('/about', mixedRoutes)
    expect(result).toBeTruthy()
    expect(result!.route.path).toBe('/about')
  })

  it('matches routes with query strings', () => {
    const result = matchRoute('/about?foo=bar', routes)
    expect(result).toBeTruthy()
    expect(result!.route.path).toBe('/about')
  })

  it('ignores hash fragments', () => {
    const result = matchRoute('/about#section', routes)
    expect(result).toBeTruthy()
    expect(result!.route.path).toBe('/about')
  })

  it('returns null for empty non-root path', () => {
    const result = matchRoute('', routes)
    expect(result).toBeNull()
  })

  it('handles route with pattern that always matches but has no capture groups', () => {
    const catchAll: Route[] = [
      {
        path: '/catch-all',
        pattern: /.*/,
        paramNames: [],
        filePath: 'catchall.vue',
        type: 'page',
      },
    ]
    const result = matchRoute('/anything', catchAll)
    expect(result).toBeTruthy()
    expect(result!.params).toEqual({})
  })
})
