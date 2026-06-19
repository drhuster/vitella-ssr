import { describe, it, expect } from 'vitest'
import { vueAdapter } from '../src/index.js'
import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'
import SimpleComponent from './fixtures/SimpleComponent.vue'
import PropsComponent from './fixtures/PropsComponent.vue'
import HeadComponent from './fixtures/HeadComponent.vue'

function createReqRes() {
  const req = new IncomingMessage(new Socket())
  const res = new ServerResponse(req)
  return { req, res }
}

describe('vueAdapter', () => {
  it('has the correct name and extensions', () => {
    expect(vueAdapter.name).toBe('vue')
    expect(vueAdapter.extensions).toEqual(['.vue'])
  })

  it('render produces HTML string from a Vue component', async () => {
    const { req, res } = createReqRes()

    const result = await vueAdapter.render({
      page: 'test.vue',
      component: SimpleComponent,
      loadData: {},
      req,
      res,
    })

    const html = typeof result === 'string' ? result : result.html
    expect(html).toContain('<div')
    expect(html).toContain('Hello from Vue')
  })

  it('passes loadData as props', async () => {
    const { req, res } = createReqRes()

    const result = await vueAdapter.render({
      page: 'test.vue',
      component: PropsComponent,
      loadData: { message: 'SSR works!' },
      req,
      res,
    })

    const html = typeof result === 'string' ? result : result.html
    expect(html).toContain('SSR works!')
  })

  it('returns structured result with html, title, and head', async () => {
    const { req, res } = createReqRes()

    const result = await vueAdapter.render({
      page: 'test.vue',
      component: HeadComponent,
      loadData: {},
      req,
      res,
    })

    expect(typeof result).not.toBe('string')
    if (typeof result !== 'string') {
      expect(result.html).toContain('Custom Head Page')
      expect(result.title).toBe('Test Page')
      expect(result.head).toContain('Test Page')
    }
  })

  it('renders within a layout component when layout is provided', async () => {
    const { req, res } = createReqRes()
    const TestLayout = {
      template: '<div class="layout"><slot /></div>',
    }
    const result = await vueAdapter.render({
      page: 'test.vue', component: SimpleComponent, layout: TestLayout, loadData: {}, req, res,
    })
    const html = typeof result === 'string' ? result : result.html
    expect(html).toContain('class="layout"')
    expect(html).toContain('Hello from Vue')
  })

  it('getClientEntry wraps page in layout when layout path is provided', () => {
    const entry = vueAdapter.getClientEntry!('/about', 'src/pages/about.vue', 'src/pages/_layout.vue')
    expect(entry).toContain('_layout.vue')
    expect(entry).toContain('h(Layout, null')
    expect(entry).toContain('about.vue')
  })

  it('getClientEntry does not wrap when layout is not provided', () => {
    const entry = vueAdapter.getClientEntry!('/about', 'src/pages/about.vue')
    expect(entry).not.toContain('h(Layout')
  })

  it('getClientEntry returns valid JS module source', () => {
    const entry = vueAdapter.getClientEntry!('/about', 'src/pages/about.vue')
    expect(entry).toContain('createSSRApp')
    expect(entry).toContain('src/pages/about.vue')
    expect(entry).toContain('__INITIAL_STATE__')
    expect(entry).toContain('mount')
  })
})
