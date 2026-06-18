import { describe, it, expect } from 'vitest'

describe('types', () => {
  it('Route type supports page and api', () => {
    const pageRoute = { path: '/', pattern: /^\/(\?.*)?$/, paramNames: [], filePath: 'src/pages/index.vue', type: 'page' as const }
    expect(pageRoute.type).toBe('page')

    const apiRoute = { path: '/api/hello', pattern: /^\/api\/hello(\?.*)?$/, paramNames: [], filePath: 'src/server/hello.js', type: 'api' as const }
    expect(apiRoute.type).toBe('api')
  })

  it('RouteManifest holds pages and apis arrays', () => {
    const manifest = { pages: [], apis: [] }
    expect(Array.isArray(manifest.pages)).toBe(true)
    expect(Array.isArray(manifest.apis)).toBe(true)
  })

  it('Adapter interface has required properties', () => {
    const adapter = {
      name: 'test',
      extensions: ['.test'],
      render: async () => '<html></html>'
    }
    expect(adapter.name).toBe('test')
    expect(adapter.extensions).toEqual(['.test'])
  })
})
