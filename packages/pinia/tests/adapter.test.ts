import { vi, describe, it, expect, beforeEach } from 'vitest'
import { piniaVueAdapter } from '../src/adapter.js'

const { mockCreateSSRApp, mockH, mockRenderToString, mockCreatePiniaSSR, mockSerialize, capturedOptions } = vi.hoisted(() => {
  const capturedOptions: { current: any } = { current: null }

  const mockCreateSSRApp = vi.fn((options) => {
    capturedOptions.current = options
    return { use: vi.fn().mockReturnThis() }
  })

  const mockH = vi.fn((comp: any, ...args: any[]) => ({ comp, args }))
  const mockRenderToString = vi.fn()
  const mockSerialize = vi.fn().mockReturnValue({})
  const mockCreatePiniaSSR = vi.fn(() => ({
    pinia: { state: { value: {} } },
    serialize: mockSerialize,
  }))

  return { mockCreateSSRApp, mockH, mockRenderToString, mockCreatePiniaSSR, mockSerialize, capturedOptions }
})

vi.mock('vue', () => ({
  createSSRApp: mockCreateSSRApp,
  h: mockH,
}))

vi.mock('vue/server-renderer', () => ({
  renderToString: mockRenderToString,
}))

vi.mock('../src/server.js', () => ({
  createPiniaSSR: mockCreatePiniaSSR,
}))

describe('piniaVueAdapter.render', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns raw html string when renderToString produces no head data', async () => {
    mockRenderToString.mockResolvedValue('<div>hello</div>')

    const result = await piniaVueAdapter.render({ component: {}, loadData: {} })

    expect(result).toBe('<div>hello</div>')
  })

  it('returns structured result with title and head when ssrContext has head data', async () => {
    mockRenderToString.mockImplementation((_app: any, ssrContext: any) => {
      if (capturedOptions.current?.render) capturedOptions.current.render()
      ssrContext.head = {
        title: 'Test Title',
        meta: [{ name: 'description', content: 'test' }],
        link: [{ rel: 'stylesheet', href: '/style.css' }],
      }
      return '<div>hello</div>'
    })

    const result = await piniaVueAdapter.render({ component: {}, loadData: {} })

    expect(result).toEqual({
      html: '<div>hello</div>',
      title: 'Test Title',
      head: expect.stringContaining('description'),
    })
  })

  it('includes meta tags in head string', async () => {
    mockRenderToString.mockImplementation((_app: any, ssrContext: any) => {
      if (capturedOptions.current?.render) capturedOptions.current.render()
      ssrContext.head = {
        meta: [{ name: 'description', content: 'test' }],
      }
      return '<div>hello</div>'
    })

    const result = await piniaVueAdapter.render({ component: {}, loadData: {} }) as any

    expect(result.head).toContain('name="description"')
    expect(result.head).toContain('content="test"')
  })

  it('includes link tags in head string', async () => {
    mockRenderToString.mockImplementation((_app: any, ssrContext: any) => {
      if (capturedOptions.current?.render) capturedOptions.current.render()
      ssrContext.head = {
        link: [{ rel: 'stylesheet', href: '/style.css' }],
      }
      return '<div>hello</div>'
    })

    const result = await piniaVueAdapter.render({ component: {}, loadData: {} }) as any

    expect(result.head).toContain('rel="stylesheet"')
    expect(result.head).toContain('href="/style.css"')
  })

  it('handles meta tags with charset attribute', async () => {
    mockRenderToString.mockImplementation((_app: any, ssrContext: any) => {
      if (capturedOptions.current?.render) capturedOptions.current.render()
      ssrContext.head = {
        meta: [{ charset: 'utf-8' }],
      }
      return '<div>hello</div>'
    })

    const result = await piniaVueAdapter.render({ component: {}, loadData: {} }) as any

    expect(result.head).toContain('charset="utf-8"')
  })

  it('handles meta tags with property attribute', async () => {
    mockRenderToString.mockImplementation((_app: any, ssrContext: any) => {
      if (capturedOptions.current?.render) capturedOptions.current.render()
      ssrContext.head = {
        meta: [{ property: 'og:title', content: 'Title' }],
      }
      return '<div>hello</div>'
    })

    const result = await piniaVueAdapter.render({ component: {}, loadData: {} }) as any

    expect(result.head).toContain('property="og:title"')
  })

  it('returns undefined head when headData exists but no meta/link', async () => {
    mockRenderToString.mockImplementation((_app: any, ssrContext: any) => {
      if (capturedOptions.current?.render) capturedOptions.current.render()
      ssrContext.head = { title: 'Title Only' }
      return '<div>hello</div>'
    })

    const result = await piniaVueAdapter.render({ component: {}, loadData: {} }) as any

    expect(result.title).toBe('Title Only')
    expect(result.head).toBeUndefined()
  })

  it('calls h with layout and renders inner component slot', async () => {
    const layout = { name: 'Layout' }
    const component = { name: 'Page' }

    mockRenderToString.mockImplementation(async (_app: any, _ssrContext: any) => {
      if (capturedOptions.current?.render) {
        const vnode = capturedOptions.current.render()
        if (vnode?.args?.[1]?.default) vnode.args[1].default()
      }
      return '<div>layout-content</div>'
    })

    await piniaVueAdapter.render({ component, loadData: {}, layout })

    expect(mockCreatePiniaSSR).toHaveBeenCalledOnce()
    expect(mockH).toHaveBeenCalledWith(layout, null, expect.objectContaining({
      default: expect.any(Function),
    }))
    expect(mockH).toHaveBeenCalledWith(component, {})
  })

  it('calls h with component directly when no layout', async () => {
    const component = { name: 'Page' }

    mockRenderToString.mockImplementation(async (_app: any, _ssrContext: any) => {
      if (capturedOptions.current?.render) capturedOptions.current.render()
      return '<div>no-layout</div>'
    })

    await piniaVueAdapter.render({ component, loadData: {} })

    expect(mockH).toHaveBeenCalledWith(component, {})
  })

  it('stores pinia state in loadData when serialize returns data', async () => {
    mockRenderToString.mockResolvedValue('<div>hello</div>')
    mockSerialize.mockReturnValue({ cart: { items: [] } })

    const loadData: Record<string, unknown> = {}
    await piniaVueAdapter.render({ component: {}, loadData })

    expect(loadData.pinia).toEqual({ cart: { items: [] } })
  })

  it('does not set loadData.pinia when serialize returns empty object', async () => {
    mockRenderToString.mockResolvedValue('<div>hello</div>')
    mockSerialize.mockReturnValue({})

    const loadData: Record<string, unknown> = {}
    await piniaVueAdapter.render({ component: {}, loadData })

    expect(loadData).not.toHaveProperty('pinia')
  })
})

describe('piniaVueAdapter.name', () => {
  it('is defined as pinia-vue', () => {
    expect(piniaVueAdapter.name).toBe('pinia-vue')
  })
})

describe('piniaVueAdapter.getClientEntry', () => {
  it('generates client entry without layout', () => {
    const result = piniaVueAdapter.getClientEntry('/test', '/src/pages/test.js')

    expect(result).toContain('import { createSSRApp } from \'vue\'')
    expect(result).toContain('import { hydratePinia } from \'@vitella-ssr/pinia\'')
    expect(result).toContain('import Page from "/src/pages/test.js"')
    expect(result).toContain('const pinia = hydratePinia()')
    expect(result).toContain('app.use(pinia)')
    expect(result).toContain('app.mount(\'#app\')')
    expect(result).not.toContain('Layout')
  })

  it('generates client entry with layout', () => {
    const result = piniaVueAdapter.getClientEntry('/test', '/src/pages/test.js', '/src/layouts/main.js')

    expect(result).toContain('import Layout from "/src/layouts/main.js"')
    expect(result).toContain('import Page from "/src/pages/test.js"')
    expect(result).toContain('h(Layout, null, { default: () => h(Page, __initState) })')
  })

  it('includes __initState with window.__INITIAL_STATE__ fallback', () => {
    const result = piniaVueAdapter.getClientEntry('/test', '/src/pages/test.js')

    expect(result).toContain('window.__INITIAL_STATE__')
    expect(result).toContain('__initState')
  })
})
