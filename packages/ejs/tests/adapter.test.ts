import { describe, it, expect } from 'vitest'
import ejs from 'ejs'
import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'
import { ejsAdapter, ejsVitePlugin } from '../src/index.js'
import { renderEjsTemplate } from '../src/renderer.js'

function createReqRes() {
  const req = new IncomingMessage(new Socket())
  const res = new ServerResponse(req)
  return { req, res }
}

function compile(tpl: string) {
  return ejs.compile(tpl, { client: true })
}

// ---------------------------------------------------------------------------
// renderEjsTemplate — unit tests for the renderer
// ---------------------------------------------------------------------------
describe('renderEjsTemplate', () => {
  it('returns AdapterRenderResult with html string', async () => {
    const result = await renderEjsTemplate(compile('<p>hello</p>'), {})
    expect(result).toEqual({ html: '<p>hello</p>' })
  })

  it('renders data into template', async () => {
    const result = await renderEjsTemplate(compile('<h1><%= title %></h1>'), { title: 'Hello' })
    expect(result.html).toBe('<h1>Hello</h1>')
  })

  it('renders with empty loadData object', async () => {
    const result = await renderEjsTemplate(compile('<p>static</p>'), {})
    expect(result.html).toBe('<p>static</p>')
  })

  it('handles null values in loadData', async () => {
    const result = await renderEjsTemplate(compile('<%= val %>'), { val: null })
    expect(result.html).toBe('')
  })

  it('handles undefined values in loadData', async () => {
    const result = await renderEjsTemplate(compile('<%= val %>'), { val: undefined })
    expect(result.html).toBe('')
  })

  it('handles numeric data', async () => {
    const result = await renderEjsTemplate(compile('<%= count %>'), { count: 42 })
    expect(result.html).toBe('42')
  })

  it('handles boolean data', async () => {
    const result = await renderEjsTemplate(compile('<%= active %>'), { active: true })
    expect(result.html).toBe('true')
  })

  it('handles deeply nested data', async () => {
    const tpl = compile('<%= user.profile.name %> lives in <%= user.profile.address.city %>')
    const result = await renderEjsTemplate(tpl, {
      user: { profile: { name: 'Alice', address: { city: 'NYC' } } },
    })
    expect(result.html).toBe('Alice lives in NYC')
  })

  it('renders arrays with iteration', async () => {
    const tpl = compile('<% items.forEach(i => { %><li><%= i %></li><% }) %>')
    const result = await renderEjsTemplate(tpl, { items: ['a', 'b'] })
    expect(result.html).toBe('<li>a</li><li>b</li>')
  })

  it('supports if/else conditionals', async () => {
    const tpl = compile('<% if (show) { %>yes<% } else { %>no<% } %>')
    expect((await renderEjsTemplate(tpl, { show: true })).html).toBe('yes')
    expect((await renderEjsTemplate(tpl, { show: false })).html).toBe('no')
  })

  it('escapes HTML in interpolated values', async () => {
    const result = await renderEjsTemplate(compile('<%= x %>'), { x: '<script>alert(1)</script>' })
    expect(result.html).not.toContain('<script>')
    expect(result.html).toContain('&lt;script&gt;')
  })

  it('renders raw HTML with unescaped output', async () => {
    const result = await renderEjsTemplate(compile('<%- x %>'), { x: '<strong>bold</strong>' })
    expect(result.html).toBe('<strong>bold</strong>')
  })

  it('wraps page in layout', async () => {
    const page = compile('<p><%= msg %></p>')
    const layout = compile('<div class="shell"><%- content %></div>')
    const result = await renderEjsTemplate(page, { msg: 'hi' }, layout)
    expect(result.html).toBe('<div class="shell"><p>hi</p></div>')
  })

  it('passes loadData to layout alongside content', async () => {
    const page = compile('<%= body %>')
    const layout = compile('<h1><%= title %></h1><%- content %>')
    const result = await renderEjsTemplate(page, { title: 'T', body: 'B' }, layout)
    expect(result.html).toBe('<h1>T</h1>B')
  })

  it('layout content overrides loadData.content key', async () => {
    const page = compile('page')
    const layout = compile('<%= content %>')
    const result = await renderEjsTemplate(page, { content: 'original' }, layout)
    // layout receives { content: 'page', ...loadData } so content should be 'page' not 'original'
    expect(result.html).toBe('page')
  })

  it('layout without content variable still renders', async () => {
    const page = compile('inner')
    const layout = compile('<wrapper><%= title %></wrapper>')
    const result = await renderEjsTemplate(page, { title: 'T' }, layout)
    expect(result.html).toBe('<wrapper>T</wrapper>')
  })

  it('throws when template function errors', async () => {
    const broken = compile('<% throw new Error("oops") %>')
    await expect(renderEjsTemplate(broken, {})).rejects.toThrow('oops')
  })
})

// ---------------------------------------------------------------------------
// ejsAdapter — integration tests
// ---------------------------------------------------------------------------
describe('ejsAdapter', () => {
  it('has the correct name and extensions', () => {
    expect(ejsAdapter.name).toBe('ejs')
    expect(ejsAdapter.extensions).toEqual(['.ejs'])
  })

  it('returns structured AdapterRenderResult (not string)', async () => {
    const { req, res } = createReqRes()
    const result = await ejsAdapter.render({
      page: 'p.ejs', component: compile('x'), loadData: {}, req, res,
    })
    expect(typeof result).toBe('object')
    expect(result).toHaveProperty('html')
    if (typeof result !== 'string') {
      expect(typeof result.html).toBe('string')
    }
  })

  it('renders a template with loadData', async () => {
    const { req, res } = createReqRes()
    const result = await ejsAdapter.render({
      page: 'p.ejs', component: compile('<h1><%= msg %></h1>'), loadData: { msg: 'Hello' }, req, res,
    })
    expect(typeof result).not.toBe('string')
    if (typeof result !== 'string') {
      expect(result.html).toBe('<h1>Hello</h1>')
    }
  })

  it('renders with empty loadData', async () => {
    const { req, res } = createReqRes()
    const result = await ejsAdapter.render({
      page: 'p.ejs', component: compile('<p>static</p>'), loadData: {}, req, res,
    })
    const html = typeof result === 'string' ? result : result.html
    expect(html).toBe('<p>static</p>')
  })

  it('handles numeric and boolean values in loadData', async () => {
    const { req, res } = createReqRes()
    const component = compile('<%= n %> <%= b %>')
    const result = await ejsAdapter.render({
      page: 'p.ejs', component, loadData: { n: 10, b: false }, req, res,
    })
    const html = typeof result === 'string' ? result : result.html
    expect(html).toBe('10 false')
  })

  it('handles deeply nested loadData', async () => {
    const { req, res } = createReqRes()
    const component = compile('<%= a.b.c %>')
    const result = await ejsAdapter.render({
      page: 'p.ejs', component, loadData: { a: { b: { c: 'deep' } } }, req, res,
    })
    const html = typeof result === 'string' ? result : result.html
    expect(html).toBe('deep')
  })

  it('wraps page in layout when layout is provided', async () => {
    const { req, res } = createReqRes()
    const result = await ejsAdapter.render({
      page: 'p.ejs',
      component: compile('<main><%= body %></main>'),
      layout: compile('<div class="layout"><%- content %></div>'),
      loadData: { body: 'content' },
      req, res,
    })
    const html = typeof result === 'string' ? result : result.html
    expect(html).toContain('class="layout"')
    expect(html).toContain('<main>content</main>')
  })

  it('passes loadData to layout alongside content', async () => {
    const { req, res } = createReqRes()
    const result = await ejsAdapter.render({
      page: 'p.ejs',
      component: compile('<%= pageTitle %>'),
      layout: compile('<h1><%= siteTitle %></h1><%- content %>'),
      loadData: { pageTitle: 'Page', siteTitle: 'Site' },
      req, res,
    })
    const html = typeof result === 'string' ? result : result.html
    expect(html).toBe('<h1>Site</h1>Page')
  })

  it('overrides loadData.content with rendered page in layout', async () => {
    const { req, res } = createReqRes()
    const result = await ejsAdapter.render({
      page: 'p.ejs',
      component: compile('page-html'),
      layout: compile('<%= content %>'),
      loadData: { content: 'original' },
      req, res,
    })
    const html = typeof result === 'string' ? result : result.html
    expect(html).toBe('page-html')
  })

  it('handles render without layout', async () => {
    const { req, res } = createReqRes()
    const result = await ejsAdapter.render({
      page: 'p.ejs', component: compile('<%= x %>'), loadData: { x: 'ok' }, req, res,
    })
    const html = typeof result === 'string' ? result : result.html
    expect(html).toBe('ok')
  })

  it('propagates errors from template function', async () => {
    const { req, res } = createReqRes()
    const broken = compile('<% throw new Error("fail") %>')
    await expect(ejsAdapter.render({
      page: 'p.ejs', component: broken, loadData: {}, req, res,
    })).rejects.toThrow('fail')
  })

  it('getClientEntry returns valid JS referencing __INITIAL_STATE__', () => {
    const entry = ejsAdapter.getClientEntry!('/page', 'src/pages/page.ejs')
    expect(entry).toContain('__INITIAL_STATE__')
    expect(() => new Function(entry)).not.toThrow()
  })

  it('getClientEntry returns same result regardless of args', () => {
    const a = ejsAdapter.getClientEntry!('/a', 'src/a.ejs', 'layout.ejs')
    const b = ejsAdapter.getClientEntry!('/b', 'src/b.ejs')
    const c = ejsAdapter.getClientEntry!()
    expect(a).toBe(b)
    expect(b).toBe(c)
  })
})

// ---------------------------------------------------------------------------
// ejsVitePlugin — unit tests for the Vite plugin
// ---------------------------------------------------------------------------
describe('ejsVitePlugin', () => {
  it('has the correct name', () => {
    expect(ejsVitePlugin().name).toBe('vitella-ejs')
  })

  it('has enforce set to pre', () => {
    expect(ejsVitePlugin().enforce).toBe('pre')
  })

  function evalModule(result: { code: string }): (...args: any[]) => string {
    // The generated code is: export default new Function('return ' + "...")()
    const expr = result.code.replace('export default ', '')
    // Evaluate in global scope via indirect eval (non-strict)
    return (0, eval)(expr)
  }

  it('transforms .ejs files into a callable template function', () => {
    const plugin = ejsVitePlugin()
    const result = plugin.transform!('<h1><%= title %></h1>', 'page.ejs')
    expect(result).toBeTruthy()
    if (result) {
      expect(result.code).toMatch(/export default new Function/)
      const fn = evalModule(result)
      const html = fn({ title: 'Test' })
      expect(html).toContain('<h1>Test</h1>')
    }
  })

  it('transforms empty .ejs template', () => {
    const plugin = ejsVitePlugin()
    const result = plugin.transform!('', 'empty.ejs')
    expect(result).toBeTruthy()
    if (result) {
      const fn = evalModule(result)
      expect(fn({})).toBe('')
    }
  })

  it('transforms template with only script tags', () => {
    const plugin = ejsVitePlugin()
    const result = plugin.transform!('<% const x = 1 + 2; %>', 'script.ejs')
    expect(result).toBeTruthy()
    if (result) {
      const fn = evalModule(result)
      expect(fn({})).toBe('')
    }
  })

  it('transforms template with EJS comments', () => {
    const plugin = ejsVitePlugin()
    const result = plugin.transform!('<%# this is a comment %><p>visible</p>', 'comment.ejs')
    expect(result).toBeTruthy()
    if (result) {
      const fn = evalModule(result)
      expect(fn({})).toBe('<p>visible</p>')
    }
  })

  it('transforms template with if/else logic', () => {
    const plugin = ejsVitePlugin()
    const result = plugin.transform!('<% if (show) { %><%= val %><% } %>', 'if.ejs')
    expect(result).toBeTruthy()
    if (result) {
      const fn = evalModule(result)
      expect(fn({ show: true, val: 'yes' })).toBe('yes')
      expect(fn({ show: false, val: 'no' })).toBe('')
    }
  })

  it('transforms template with for loop', () => {
    const plugin = ejsVitePlugin()
    const tpl = '<% for (let i = 0; i < items.length; i++) { %><%= items[i] %><% } %>'
    const result = plugin.transform!(tpl, 'loop.ejs')
    expect(result).toBeTruthy()
    if (result) {
      const fn = evalModule(result)
      expect(fn({ items: ['a', 'b', 'c'] })).toBe('abc')
    }
  })

  it('transforms template with unescaped output', () => {
    const plugin = ejsVitePlugin()
    const result = plugin.transform!('<%- raw %>', 'raw.ejs')
    expect(result).toBeTruthy()
    if (result) {
      const fn = evalModule(result)
      expect(fn({ raw: '<br>' })).toBe('<br>')
    }
  })

  it('returns null for non-.ejs files', () => {
    const plugin = ejsVitePlugin()
    expect(plugin.transform!('x', 'script.js')).toBeNull()
    expect(plugin.transform!('x', 'style.css')).toBeNull()
    expect(plugin.transform!('x', 'file.ts')).toBeNull()
    expect(plugin.transform!('x', 'file.html')).toBeNull()
  })

  it('sets map to null in transform result', () => {
    const plugin = ejsVitePlugin()
    const result = plugin.transform!('x', 't.ejs')
    expect(result).toBeTruthy()
    if (result) {
      expect(result.map).toBeNull()
    }
  })
})
