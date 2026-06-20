import { describe, it, expect } from 'vitest'
import { generateBuildManifest } from '../src/build.js'
import type { RouteManifest } from '../src/types.js'

describe('generateBuildManifest', () => {
  it('creates build manifest from route manifest', () => {
    const routeManifest: RouteManifest = {
      pages: [
        { path: '/', pattern: /^\//, paramNames: [], filePath: 'src/pages/index.vue', type: 'page' },
        { path: '/about', pattern: /^\/about/, paramNames: [], filePath: 'src/pages/about.vue', type: 'page' },
      ],
      apis: [
        { path: '/api/hello', pattern: /^\/api\/hello/, paramNames: [], filePath: 'src/server/hello.js', type: 'api' },
      ],
    }

    const buildManifest = generateBuildManifest(routeManifest)
    expect(buildManifest.pages['/']).toBeDefined()
    expect(buildManifest.pages['/about']).toBeDefined()
    expect(buildManifest.apis['/api/hello']).toBeDefined()
    expect(buildManifest.pages['/'].clientEntry).toContain('index')
    expect(buildManifest.pages['/about'].serverEntry).toContain('about')
  })

  it('handles dynamic route paths', () => {
    const routeManifest: RouteManifest = {
      pages: [
        { path: '/blog/:slug', pattern: /^\/blog\/([^/]+)/, paramNames: ['slug'], filePath: 'src/pages/blog/[slug].vue', type: 'page' },
      ],
      apis: [],
    }

    const buildManifest = generateBuildManifest(routeManifest)
    expect(buildManifest.pages['/blog/:slug']).toBeDefined()
  })

  it('returns empty objects for empty manifests', () => {
    const routeManifest: RouteManifest = { pages: [], apis: [] }
    const buildManifest = generateBuildManifest(routeManifest)
    expect(buildManifest.pages).toEqual({})
    expect(buildManifest.apis).toEqual({})
  })

  it('includes error page entry when errorPage is in route manifest', () => {
    const routeManifest: RouteManifest = {
      pages: [
        { path: '/', pattern: /^\//, paramNames: [], filePath: 'src/pages/index.vue', type: 'page' },
      ],
      apis: [],
      errorPage: { filePath: 'src/pages/_error.vue' },
    }
    const buildManifest = generateBuildManifest(routeManifest)
    expect(buildManifest.pages['__error__']).toBeDefined()
    expect(buildManifest.pages['__error__'].serverEntry).toContain('_error')
  })

  it('omits error page entry when no errorPage in route manifest', () => {
    const routeManifest: RouteManifest = {
      pages: [
        { path: '/', pattern: /^\//, paramNames: [], filePath: 'src/pages/index.vue', type: 'page' },
      ],
      apis: [],
    }
    const buildManifest = generateBuildManifest(routeManifest)
    expect(buildManifest.pages['__error__']).toBeUndefined()
  })

  it('includes optional css field in page entries', () => {
    const routeManifest: RouteManifest = {
      pages: [
        { path: '/', pattern: /^\//, paramNames: [], filePath: 'src/pages/index.vue', type: 'page' },
      ],
      apis: [],
    }
    const buildManifest = generateBuildManifest(routeManifest)
    expect(buildManifest.pages['/']).toHaveProperty('css')
    expect(buildManifest.pages['/'].css).toBeUndefined()
  })
})
