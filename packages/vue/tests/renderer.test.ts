import { describe, it, expect } from 'vitest'
import { vueAdapter } from '../src/index.js'
import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'
import SimpleComponent from './fixtures/SimpleComponent.vue'
import PropsComponent from './fixtures/PropsComponent.vue'

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

    const html = await vueAdapter.render({
      page: 'test.vue',
      component: SimpleComponent,
      loadData: {},
      req,
      res,
    })

    expect(html).toContain('<div')
    expect(html).toContain('Hello from Vue')
  })

  it('passes loadData as props', async () => {
    const { req, res } = createReqRes()

    const html = await vueAdapter.render({
      page: 'test.vue',
      component: PropsComponent,
      loadData: { message: 'SSR works!' },
      req,
      res,
    })

    expect(html).toContain('SSR works!')
  })
})
