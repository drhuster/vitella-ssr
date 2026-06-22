import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createProdServer } from '../src/prod-server.js'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import http from 'http'

describe('createProdServer', () => {
  let tmpDir: string
  let server: http.Server
  const port = 9876

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-prod-'))
    const distDir = join(tmpDir, 'dist')
    mkdirSync(distDir, { recursive: true })

    const buildManifest = { pages: {}, apis: {} }
    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify(buildManifest))

    server = await createProdServer({
      distDir,
      appShell: join(tmpDir, 'src', 'app.html'),
    })

    await new Promise<void>(resolve => server.listen(port, resolve))
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('starts and responds with 404 for unknown routes', async () => {
    const res = await fetch(`http://localhost:${port}/nonexistent`)
    expect(res.status).toBe(404)
  })

  it('serves static files from dist/client directory', async () => {
    const distClient = join(tmpDir, 'dist', 'client')
    mkdirSync(distClient, { recursive: true })
    writeFileSync(join(distClient, 'test.txt'), 'hello')

    const res = await fetch(`http://localhost:${port}/test.txt`)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toBe('hello')
  })

  it('returns 404 for root when no page handler exists', async () => {
    const res = await fetch(`http://localhost:${port}/`)
    expect(res.status).toBe(404)
  })

  it('blocks path traversal attempts via static files', async () => {
    const secretFile = join(tmpDir, 'secret.txt')
    writeFileSync(secretFile, 'sensitive data')

    const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = http.get(
        { hostname: 'localhost', port, path: '/../../secret.txt' },
        resolve,
      )
      req.on('error', reject)
    })

    expect(res.statusCode).toBe(403)
  })
})

describe('createProdServer with CSS links and scripts', () => {
  let tmpDir: string
  let server: http.Server
  const port = 9878

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-css-'))
    const distDir = join(tmpDir, 'dist')
    mkdirSync(distDir, { recursive: true })
    mkdirSync(join(distDir, 'client'), { recursive: true })
    mkdirSync(join(distDir, 'server'), { recursive: true })

    // Write a server module that renders HTML directly
    writeFileSync(join(distDir, 'server', 'index.js'), `
export default {
  render: () => "<div>hello</div>"
}
`)

    // Write app shell
    const appShell = join(tmpDir, 'app.html')
    writeFileSync(appShell, '<html><head><!--vitella-head--></head><body><!--vitella-html--><!--vitella-scripts--></body></html>')

    // Write manifest with CSS and client entry
    const manifest = {
      pages: {
        '/': { clientEntry: 'assets/index.js', serverEntry: 'server/index.js', css: ['assets/style.css'] },
      },
      apis: {},
    }
    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify(manifest))

    // Write routes
    writeFileSync(join(distDir, 'routes.json'), JSON.stringify({
      pages: [{ path: '/', paramNames: [], type: 'page' }],
      apis: [],
    }))

    const config = {
      appShell,
      adapter: {
        name: 'test',
        extensions: ['.js'],
        render: async () => '<div>hello</div>',
        getClientEntry: () => 'import { createSSRApp } from "vue"',
      },
    }

    server = await createProdServer({ distDir, appShell, manifest, config: config as any })
    await new Promise<void>(resolve => server.listen(port, resolve))
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('injects CSS links from manifest', async () => {
    const res = await fetch(`http://localhost:${port}/`)
    const text = await res.text()
    expect(text).toContain('assets/style.css')
    expect(text).toContain('<link rel="stylesheet"')
  })

  it('injects client entry script when adapter provides getClientEntry', async () => {
    const res = await fetch(`http://localhost:${port}/`)
    const text = await res.text()
    expect(text).toContain('assets/index.js')
    expect(text).toContain('<script')
  })
})

describe('createProdServer with middleware errors', () => {
  let tmpDir: string
  let server: http.Server
  const port = 9877

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-mw-'))
    const distDir = join(tmpDir, 'dist')
    mkdirSync(distDir, { recursive: true })
    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify({ pages: {}, apis: {} }))

    const errorMiddleware = async (_req: any, _res: any, _next: any) => {
      throw new Error('middleware error')
    }

    server = await createProdServer({
      distDir,
      appShell: join(tmpDir, 'app.html'),
      config: { middleware: [errorMiddleware as any] } as any,
    })
    await new Promise<void>(resolve => server.listen(port, resolve))
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns 500 when middleware throws', async () => {
    const res = await fetch(`http://localhost:${port}/`)
    expect(res.status).toBe(500)
  })
})

describe('createProdServer with assets directory', () => {
  let tmpDir: string
  let server: http.Server
  const port = 9879

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-assets-'))
    const distDir = join(tmpDir, 'dist')
    mkdirSync(distDir, { recursive: true })

    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify({ pages: {}, apis: {} }))
    writeFileSync(join(distDir, 'routes.json'), JSON.stringify({ pages: [], apis: [] }))

    // Create dist/client directory with an assets subdirectory
    const clientAssets = join(distDir, 'client', 'assets')
    mkdirSync(clientAssets, { recursive: true })

    // Create test assets
    writeFileSync(join(clientAssets, 'test.css'), 'body { color: red; }')
    writeFileSync(join(clientAssets, 'logo.png'), 'fake-png-data')

    const nestedDir = join(clientAssets, 'nested')
    mkdirSync(nestedDir, { recursive: true })
    writeFileSync(join(nestedDir, 'deep.txt'), 'deep file')

    server = await createProdServer({
      distDir,
      appShell: join(tmpDir, 'app.html'),
    })
    await new Promise<void>(resolve => server.listen(port, resolve))
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('serves CSS files from /assets/ path', async () => {
    const res = await fetch(`http://localhost:${port}/assets/test.css`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/css')
    const text = await res.text()
    expect(text).toBe('body { color: red; }')
  })

  it('serves image files from /assets/ path', async () => {
    const res = await fetch(`http://localhost:${port}/assets/logo.png`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    const text = await res.text()
    expect(text).toBe('fake-png-data')
  })

  it('returns 404 for missing assets', async () => {
    const res = await fetch(`http://localhost:${port}/assets/missing.js`)
    expect(res.status).toBe(404)
  })

  it('blocks path traversal in assets', async () => {
    const secretFile = join(tmpDir, 'secret.txt')
    writeFileSync(secretFile, 'sensitive data')

    const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = http.get(
        { hostname: 'localhost', port, path: '/assets/../../secret.txt' },
        resolve,
      )
      req.on('error', reject)
    })

    expect(res.statusCode).toBe(403)
  })
})

describe('createProdServer with API handler using context', () => {
  let tmpDir: string
  let server: http.Server
  const port = 9880

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-api-ctx-'))
    const distDir = join(tmpDir, 'dist')
    mkdirSync(distDir, { recursive: true })
    mkdirSync(join(distDir, 'server'), { recursive: true })

    writeFileSync(join(distDir, 'server', 'api_echo.js'), `
export const get = async (req, res, ctx) => {
  return { status: 200, body: { params: ctx.params, query: ctx.query, cookies: ctx.cookies.getAll() } }
}
`)

    writeFileSync(join(distDir, 'server', 'api_set.js'), `
export const get = async (req, res, ctx) => {
  ctx.cookies.set('session', 'abc123', { httpOnly: true, maxAge: 3600 })
  return { status: 200, body: { ok: true } }
}
`)

    const buildManifest = {
      pages: {},
      apis: {
        '/api/echo': { serverEntry: 'server/api_echo.js' },
        '/api/set': { serverEntry: 'server/api_set.js' },
      },
    }
    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify(buildManifest))

    writeFileSync(join(distDir, 'routes.json'), JSON.stringify({
      pages: [],
      apis: [
        { path: '/api/echo', paramNames: [], type: 'api' },
        { path: '/api/set', paramNames: [], type: 'api' },
      ],
    }))

    server = await createProdServer({
      distDir,
      appShell: join(tmpDir, 'app.html'),
    })
    await new Promise<void>(resolve => server.listen(port, resolve))
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('passes params, query, and cookies to API handler via ctx', async () => {
    const res = await fetch(`http://localhost:${port}/api/echo?a=1&b=2`, {
      headers: { cookie: 'token=xyz' },
    })
    const body = await res.json()
    expect(body.query).toEqual({ a: '1', b: '2' })
    expect(body.cookies).toEqual({ token: 'xyz' })
    expect(body.params).toEqual({})
  })

  it('flushed Set-Cookie header from API handler reaches the response', async () => {
    const res = await fetch(`http://localhost:${port}/api/set`)
    expect(res.status).toBe(200)
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toContain('session=abc123')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Max-Age=3600')
  })
})

describe('createProdServer with page load using context', () => {
  let tmpDir: string
  let server: http.Server
  const port = 9881

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-page-ctx-'))
    const distDir = join(tmpDir, 'dist')
    mkdirSync(distDir, { recursive: true })
    mkdirSync(join(distDir, 'client'), { recursive: true })
    mkdirSync(join(distDir, 'server'), { recursive: true })

    writeFileSync(join(distDir, 'server', 'index.js'), `
export const load = async ({ cookies, query, params }) => {
  return { seen: cookies.getAll(), q: query, p: params }
}
export default function(data) { return '<div>' + JSON.stringify(data) + '</div>' }
`)

    const appShell = join(tmpDir, 'app.html')
    writeFileSync(appShell, '<html><head></head><body><!--vitella-html--></body></html>')

    const buildManifest = {
      pages: {
        '/': { clientEntry: 'assets/index.js', serverEntry: 'server/index.js', css: [] },
      },
      apis: {},
    }
    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify(buildManifest))

    writeFileSync(join(distDir, 'routes.json'), JSON.stringify({
      pages: [{ path: '/', paramNames: [], type: 'page' }],
      apis: [],
    }))

    server = await createProdServer({
      distDir,
      appShell,
    })
    await new Promise<void>(resolve => server.listen(port, resolve))
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('passes real request cookies to page load (regression: was hard-coded to {})', async () => {
    const res = await fetch(`http://localhost:${port}/?tab=info`, {
      headers: { cookie: 'user=alice' },
    })
    const text = await res.text()
    expect(text).toContain('"user":"alice"')
    expect(text).toContain('"tab":"info"')
  })
})

describe('createProdServer with page load setting cookies', () => {
  let tmpDir: string
  let server: http.Server
  const port = 9882

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-page-setcookie-'))
    const distDir = join(tmpDir, 'dist')
    mkdirSync(distDir, { recursive: true })
    mkdirSync(join(distDir, 'client'), { recursive: true })
    mkdirSync(join(distDir, 'server'), { recursive: true })

    writeFileSync(join(distDir, 'server', 'index.js'), `
export const load = async ({ cookies }) => {
  cookies.set('visited', '1', { httpOnly: true, path: '/' })
  return {}
}
export default function() { return '<div>hi</div>' }
`)

    const appShell = join(tmpDir, 'app.html')
    writeFileSync(appShell, '<html><head></head><body><!--vitella-html--></body></html>')

    const buildManifest = {
      pages: { '/': { clientEntry: 'assets/index.js', serverEntry: 'server/index.js', css: [] } },
      apis: {},
    }
    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify(buildManifest))
    writeFileSync(join(distDir, 'routes.json'), JSON.stringify({
      pages: [{ path: '/', paramNames: [], type: 'page' }],
      apis: [],
    }))

    server = await createProdServer({ distDir, appShell })
    await new Promise<void>(resolve => server.listen(port, resolve))
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('flushed Set-Cookie header from page load reaches the response', async () => {
    const res = await fetch(`http://localhost:${port}/`)
    expect(res.status).toBe(200)
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toContain('visited=1')
    expect(setCookie).toContain('HttpOnly')
  })
})

describe('createProdServer with structured adapter result (title, head)', () => {
  let tmpDir: string
  let server: http.Server
  const port = 9883

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-structured-'))
    const distDir = join(tmpDir, 'dist')
    mkdirSync(distDir, { recursive: true })
    mkdirSync(join(distDir, 'server'), { recursive: true })
    mkdirSync(join(distDir, 'client'), { recursive: true })

    writeFileSync(join(distDir, 'server', 'index.js'), `
export default {}
`)

    const appShell = join(tmpDir, 'app.html')
    writeFileSync(appShell, '<html><head><!--vitella-title--><!--vitella-head--></head><body><!--vitella-html--><!--vitella-scripts--></body></html>')

    const manifest = {
      pages: { '/': { clientEntry: 'assets/index.js', serverEntry: 'server/index.js', css: ['assets/style.css'] } },
      apis: {},
    }
    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify(manifest))
    writeFileSync(join(distDir, 'routes.json'), JSON.stringify({
      pages: [{ path: '/', paramNames: [], type: 'page' }],
      apis: [],
    }))

    const config = {
      appShell,
      adapter: {
        name: 'test',
        extensions: ['.js'],
        render: async () => ({ html: '<div>hello</div>', title: 'Page Title', head: '<meta name="desc" content="test">' }),
        getClientEntry: () => 'import {} from "vue"',
      },
    }

    server = await createProdServer({ distDir, appShell, manifest, config: config as any })
    await new Promise<void>(resolve => server.listen(port, resolve))
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('injects title from structured result into HTML shell', async () => {
    const res = await fetch(`http://localhost:${port}/`)
    const text = await res.text()
    expect(text).toContain('Page Title')
  })

  it('injects head from structured result into HTML shell', async () => {
    const res = await fetch(`http://localhost:${port}/`)
    const text = await res.text()
    expect(text).toContain('name="desc"')
  })

  it('still injects CSS links alongside structured result', async () => {
    const res = await fetch(`http://localhost:${port}/`)
    const text = await res.text()
    expect(text).toContain('assets/style.css')
  })
})

describe('createProdServer without adapter using mod.render fallback', () => {
  let tmpDir: string
  let server: http.Server
  const port = 9884

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-render-fb-'))
    const distDir = join(tmpDir, 'dist')
    mkdirSync(distDir, { recursive: true })
    mkdirSync(join(distDir, 'server'), { recursive: true })
    mkdirSync(join(distDir, 'client'), { recursive: true })

    writeFileSync(join(distDir, 'server', 'index.js'), `
export function render(data) { return '<div>render method</div>' }
`)

    const appShell = join(tmpDir, 'app.html')
    writeFileSync(appShell, '<html><head></head><body><!--vitella-html--></body></html>')

    const manifest = {
      pages: { '/': { serverEntry: 'server/index.js' } },
      apis: {},
    }
    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify(manifest))
    writeFileSync(join(distDir, 'routes.json'), JSON.stringify({
      pages: [{ path: '/', paramNames: [], type: 'page' }],
      apis: [],
    }))

    server = await createProdServer({ distDir, appShell, manifest })
    await new Promise<void>(resolve => server.listen(port, resolve))
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('uses mod.render when default is not a function', async () => {
    const res = await fetch(`http://localhost:${port}/`)
    const text = await res.text()
    expect(text).toContain('render method')
  })
})

describe('createProdServer with API module that fails to import', () => {
  let tmpDir: string
  let server: http.Server
  const port = 9885

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-api-err-'))
    const distDir = join(tmpDir, 'dist')
    mkdirSync(distDir, { recursive: true })
    mkdirSync(join(distDir, 'server'), { recursive: true })

    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify({ pages: {}, apis: { '/api/missing': { serverEntry: 'server/api_missing.js' } } }))
    writeFileSync(join(distDir, 'routes.json'), JSON.stringify({
      pages: [],
      apis: [{ path: '/api/missing', paramNames: [], type: 'api' }],
    }))

    server = await createProdServer({ distDir, appShell: join(tmpDir, 'app.html') })
    await new Promise<void>(resolve => server.listen(port, resolve))
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns 500 when API module file does not exist', async () => {
    const res = await fetch(`http://localhost:${port}/api/missing`)
    expect(res.status).toBe(500)
  })
})

describe('createProdServer with layout data merging', () => {
  let tmpDir: string
  let server: http.Server
  const port = 9886

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-layout-'))
    const distDir = join(tmpDir, 'dist')
    const serverDir = join(distDir, 'server')
    mkdirSync(serverDir, { recursive: true })
    mkdirSync(join(distDir, 'client'), { recursive: true })

    writeFileSync(join(serverDir, 'layout.js'), `
export const load = async () => {
  return { layoutMsg: 'from-layout' }
}
export default function({ children }) { return children || '' }
`)

    writeFileSync(join(serverDir, 'hello.js'), `
export const load = async () => {
  return { pageMsg: 'from-page' }
}
export default function(data) { return '<div>' + JSON.stringify(data) + '</div>' }
`)

    const appShell = join(tmpDir, 'app.html')
    writeFileSync(appShell, '<html><head></head><body><!--vitella-html--></body></html>')

    const manifest = {
      pages: { '/hello': { serverEntry: 'server/hello.js' } },
      apis: {},
    }
    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify(manifest))

    writeFileSync(join(distDir, 'routes.json'), JSON.stringify({
      pages: [{ path: '/hello', paramNames: [], type: 'page', layout: '_layout' }],
      apis: [],
    }))

    server = await createProdServer({ distDir, appShell, manifest })
    await new Promise<void>(resolve => server.listen(port, resolve))
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('merges layout load data into page load data', async () => {
    const res = await fetch(`http://localhost:${port}/hello`)
    const text = await res.text()
    expect(text).toContain('from-layout')
    expect(text).toContain('from-page')
  })
})

describe('createProdServer with page module import failure', () => {
  let tmpDir: string
  let server: http.Server
  const port = 9887

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-pg-err-'))
    const distDir = join(tmpDir, 'dist')
    mkdirSync(distDir, { recursive: true })
    mkdirSync(join(distDir, 'server'), { recursive: true })
    mkdirSync(join(distDir, 'client'), { recursive: true })

    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify({
      pages: { '/broken': { serverEntry: 'server/broken.js' } },
      apis: {},
    }))
    writeFileSync(join(distDir, 'routes.json'), JSON.stringify({
      pages: [{ path: '/broken', paramNames: [], type: 'page' }],
      apis: [],
    }))

    server = await createProdServer({ distDir, appShell: join(tmpDir, 'app.html') })
    await new Promise<void>(resolve => server.listen(port, resolve))
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns 500 when page module file does not exist', async () => {
    const res = await fetch(`http://localhost:${port}/broken`)
    expect(res.status).toBe(500)
  })
})

describe('createProdServer with empty page fallback', () => {
  let tmpDir: string
  let server: http.Server
  const port = 9888

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-empty-'))
    const distDir = join(tmpDir, 'dist')
    mkdirSync(join(distDir, 'server'), { recursive: true })
    mkdirSync(join(distDir, 'client'), { recursive: true })

    writeFileSync(join(distDir, 'server', 'empty.js'), 'export default {}')

    const appShell = join(tmpDir, 'app.html')
    writeFileSync(appShell, '<html><head></head><body><!--vitella-html--></body></html>')

    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify({
      pages: { '/empty': { serverEntry: 'server/empty.js' } },
      apis: {},
    }))
    writeFileSync(join(distDir, 'routes.json'), JSON.stringify({
      pages: [{ path: '/empty', paramNames: [], type: 'page' }],
      apis: [],
    }))

    server = await createProdServer({ distDir, appShell })
    await new Promise<void>(resolve => server.listen(port, resolve))
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns <div></div> when module has no default function and no render', async () => {
    const res = await fetch(`http://localhost:${port}/empty`)
    const text = await res.text()
    expect(text).toContain('<div></div>')
  })
})

describe('createProdServer with page TTL from load', () => {
  let tmpDir: string
  let server: http.Server
  const port = 9889

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-ttl-'))
    const distDir = join(tmpDir, 'dist')
    mkdirSync(join(distDir, 'server'), { recursive: true })
    mkdirSync(join(distDir, 'client'), { recursive: true })

    writeFileSync(join(distDir, 'server', 'ttl.js'), `
export const load = async () => {
  return { ttl: 300, message: 'cached' }
}
export default function(data) { return '<div>' + data.message + '</div>' }
`)

    const appShell = join(tmpDir, 'app.html')
    writeFileSync(appShell, '<html><head></head><body><!--vitella-html--></body></html>')

    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify({
      pages: { '/ttl': { serverEntry: 'server/ttl.js' } },
      apis: {},
    }))
    writeFileSync(join(distDir, 'routes.json'), JSON.stringify({
      pages: [{ path: '/ttl', paramNames: [], type: 'page' }],
      apis: [],
    }))

    server = await createProdServer({ distDir, appShell })
    await new Promise<void>(resolve => server.listen(port, resolve))
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('sets Cache-Control header from page load ttl', async () => {
    const res = await fetch(`http://localhost:${port}/ttl`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')
  })
})

describe('createProdServer with options.routes and dynamic route', () => {
  let tmpDir: string
  let server: http.Server
  const port = 9890

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-dyn-'))
    const distDir = join(tmpDir, 'dist')
    mkdirSync(join(distDir, 'server'), { recursive: true })
    mkdirSync(join(distDir, 'client'), { recursive: true })

    writeFileSync(join(distDir, 'server', 'hello__name.js'), `
export const load = async ({ params }) => {
  return { seenName: params.name }
}
export default function(data) { return '<div>' + (data.seenName || 'none') + '</div>' }
`)

    const appShell = join(tmpDir, 'app.html')
    writeFileSync(appShell, '<html><head></head><body><!--vitella-html--></body></html>')

    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify({
      pages: { '/hello/:name': { serverEntry: 'server/hello__name.js' } },
      apis: {},
    }))

    server = await createProdServer({
      distDir,
      appShell,
      routes: {
        pages: [{ path: '/hello/:name', paramNames: ['name'], type: 'page' }],
        apis: [],
      },
    })
    await new Promise<void>(resolve => server.listen(port, resolve))
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('handles dynamic routes and uses options.routes', async () => {
    const res = await fetch(`http://localhost:${port}/hello/world`)
    const text = await res.text()
    expect(text).toContain('world')
  })
})

describe('createProdServer with adapter and non-existent appShell', () => {
  let tmpDir: string
  let server: http.Server
  const port = 9891

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-adptr-catch-'))
    const distDir = join(tmpDir, 'dist')
    mkdirSync(join(distDir, 'server'), { recursive: true })
    mkdirSync(join(distDir, 'client'), { recursive: true })

    writeFileSync(join(distDir, 'server', 'index.js'), 'export default {}')

    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify({
      pages: { '/': { serverEntry: 'server/index.js', clientEntry: 'assets/index.js' } },
      apis: {},
    }))
    writeFileSync(join(distDir, 'routes.json'), JSON.stringify({
      pages: [{ path: '/', paramNames: [], type: 'page' }],
      apis: [],
    }))

    const config = {
      adapter: {
        name: 'test',
        extensions: ['.js'],
        render: async () => ({ html: '<div>catch-test</div>' }),
        getClientEntry: () => 'import {} from "vue"',
      },
    }

    server = await createProdServer({
      distDir,
      appShell: join(tmpDir, 'nonexistent-shell.html'),
      config: config as any,
    })
    await new Promise<void>(resolve => server.listen(port, resolve))
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns raw HTML when loadHtmlShell fails with adapter', async () => {
    const res = await fetch(`http://localhost:${port}/`)
    const text = await res.text()
    expect(text).toBe('<div>catch-test</div>')
  })
})

describe('createProdServer without adapter and non-existent appShell', () => {
  let tmpDir: string
  let server: http.Server
  const port = 9892

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-no-adptr-'))
    const distDir = join(tmpDir, 'dist')
    mkdirSync(join(distDir, 'server'), { recursive: true })
    mkdirSync(join(distDir, 'client'), { recursive: true })

    writeFileSync(join(distDir, 'server', 'index.js'), `
export default function() { return '<div>no-shell</div>' }
`)

    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify({
      pages: { '/': { serverEntry: 'server/index.js' } },
      apis: {},
    }))
    writeFileSync(join(distDir, 'routes.json'), JSON.stringify({
      pages: [{ path: '/', paramNames: [], type: 'page' }],
      apis: [],
    }))

    server = await createProdServer({
      distDir,
      appShell: join(tmpDir, 'nonexistent-shell.html'),
    })
    await new Promise<void>(resolve => server.listen(port, resolve))
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns raw HTML when loadHtmlShell fails without adapter', async () => {
    const res = await fetch(`http://localhost:${port}/`)
    const text = await res.text()
    expect(text).toBe('<div>no-shell</div>')
  })
})

describe('createProdServer with layout that fails to import', () => {
  let tmpDir: string
  let server: http.Server
  const port = 9893

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-layout-err-'))
    const distDir = join(tmpDir, 'dist')
    mkdirSync(join(distDir, 'server'), { recursive: true })
    mkdirSync(join(distDir, 'client'), { recursive: true })

    writeFileSync(join(distDir, 'server', 'hello.js'), `
export default function() { return '<div>layout-import-err-ok</div>' }
`)

    const appShell = join(tmpDir, 'app.html')
    writeFileSync(appShell, '<html><head></head><body><!--vitella-html--></body></html>')

    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify({
      pages: { '/hello': { serverEntry: 'server/hello.js' } },
      apis: {},
    }))
    writeFileSync(join(distDir, 'routes.json'), JSON.stringify({
      pages: [{ path: '/hello', paramNames: [], type: 'page', layout: 'missing_layout' }],
      apis: [],
    }))

    server = await createProdServer({ distDir, appShell })
    await new Promise<void>(resolve => server.listen(port, resolve))
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('still renders page when layout module does not exist', async () => {
    const res = await fetch(`http://localhost:${port}/hello`)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('layout-import-err-ok')
  })
})

describe('createProdServer with custom error page', () => {
  let tmpDir: string
  let server: http.Server
  const port = 9895

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-err-'))
    const distDir = join(tmpDir, 'dist')
    mkdirSync(join(distDir, 'server'), { recursive: true })
    mkdirSync(join(distDir, 'client'), { recursive: true })

    writeFileSync(join(distDir, 'server', '_error.js'), `
export default function(data) { return '<div>Custom Error:' + data.statusCode + '</div>' }
`)

    const appShell = join(tmpDir, 'app.html')
    writeFileSync(appShell, '<html><head></head><body><!--vitella-html--></body></html>')

    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify({ pages: {}, apis: {} }))
    writeFileSync(join(distDir, 'routes.json'), JSON.stringify({
      pages: [],
      apis: [],
      errorPage: { filePath: '_error' },
    }))

    const config = {
      adapter: {
        name: 'test',
        extensions: ['.js'],
        render: async ({ component, loadData }: any) => {
          if (typeof component === 'function') return component(loadData)
          return '<div>rendered</div>'
        },
      },
    }

    server = await createProdServer({ distDir, appShell, config: config as any })
    await new Promise<void>(resolve => server.listen(port, resolve))
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns custom error page for unknown routes', async () => {
    const res = await fetch(`http://localhost:${port}/nonexistent`)
    expect(res.status).toBe(404)
    const text = await res.text()
    expect(text).toContain('Custom Error:404')
  })
})

describe('createProdServer with error page and layout', () => {
  let tmpDir: string
  let server: http.Server
  const port = 9896

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-err-lay-'))
    const distDir = join(tmpDir, 'dist')
    mkdirSync(join(distDir, 'server'), { recursive: true })
    mkdirSync(join(distDir, 'client'), { recursive: true })

    writeFileSync(join(distDir, 'server', '_error.js'), `
export default function(data) { return '<div>Err:' + data.statusCode + '</div>' }
`)

    writeFileSync(join(distDir, 'server', 'layout.js'), `
export const load = async () => {
  return { layoutMsg: 'from-error-layout' }
}
export default function() { return '' }
`)

    const appShell = join(tmpDir, 'app.html')
    writeFileSync(appShell, '<html><head></head><body><!--vitella-html--></body></html>')

    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify({ pages: {}, apis: {} }))
    writeFileSync(join(distDir, 'routes.json'), JSON.stringify({
      pages: [],
      apis: [],
      errorPage: { filePath: '_error', layout: '_layout' },
    }))

    const config = {
      adapter: {
        name: 'test',
        extensions: ['.js'],
        render: async ({ loadData }: any) => {
          return '<div>layout-test ' + (loadData?.layoutMsg || 'no-layout-data') + '</div>'
        },
      },
    }

    server = await createProdServer({ distDir, appShell, config: config as any })
    await new Promise<void>(resolve => server.listen(port, resolve))
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('loads error layout and passes its data', async () => {
    const res = await fetch(`http://localhost:${port}/missing`)
    expect(res.status).toBe(404)
    const text = await res.text()
    expect(text).toContain('from-error-layout')
  })
})

describe('createProdServer with error page CSS', () => {
  let tmpDir: string
  let server: http.Server
  const port = 9897

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-err-css-'))
    const distDir = join(tmpDir, 'dist')
    mkdirSync(join(distDir, 'server'), { recursive: true })
    mkdirSync(join(distDir, 'client'), { recursive: true })

    writeFileSync(join(distDir, 'server', '_error.js'), `
export default function() { return '<div>styled error</div>' }
`)

    const appShell = join(tmpDir, 'app.html')
    writeFileSync(appShell, '<html><head><!--vitella-head--></head><body><!--vitella-html--></body></html>')

    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify({
      pages: { '__error__': { css: ['assets/error.css'] } },
      apis: {},
    }))
    writeFileSync(join(distDir, 'routes.json'), JSON.stringify({
      pages: [],
      apis: [],
      errorPage: { filePath: '_error' },
    }))

    const config = {
      adapter: {
        name: 'test',
        extensions: ['.js'],
        render: async () => '<div>styled error</div>',
      },
    }

    server = await createProdServer({ distDir, appShell, config: config as any })
    await new Promise<void>(resolve => server.listen(port, resolve))
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('injects error page CSS links from manifest', async () => {
    const res = await fetch(`http://localhost:${port}/anything`)
    const text = await res.text()
    expect(text).toContain('assets/error.css')
    expect(text).toContain('<link rel="stylesheet"')
  })
})

describe('createProdServer with error page structured result', () => {
  let tmpDir: string
  let server: http.Server
  const port = 9898

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-err-structured-'))
    const distDir = join(tmpDir, 'dist')
    mkdirSync(join(distDir, 'server'), { recursive: true })
    mkdirSync(join(distDir, 'client'), { recursive: true })

    writeFileSync(join(distDir, 'server', '_error.js'), 'export default {}')

    const appShell = join(tmpDir, 'app.html')
    writeFileSync(appShell, '<html><head><!--vitella-title--><!--vitella-head--></head><body><!--vitella-html--></body></html>')

    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify({ pages: {}, apis: {} }))
    writeFileSync(join(distDir, 'routes.json'), JSON.stringify({
      pages: [],
      apis: [],
      errorPage: { filePath: '_error' },
    }))

    const config = {
      adapter: {
        name: 'test',
        extensions: ['.js'],
        render: async () => ({
          html: '<div>structured error</div>',
          title: 'Error Page',
          head: '<meta name="robots" content="noindex">',
        }),
      },
    }

    server = await createProdServer({ distDir, appShell, config: config as any })
    await new Promise<void>(resolve => server.listen(port, resolve))
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('injects title from structured error result', async () => {
    const res = await fetch(`http://localhost:${port}/gone`)
    const text = await res.text()
    expect(text).toContain('Error Page')
  })

  it('injects head from structured error result', async () => {
    const res = await fetch(`http://localhost:${port}/gone`)
    const text = await res.text()
    expect(text).toContain('noindex')
  })
})

describe('createProdServer with error page fallback when module missing', () => {
  let tmpDir: string
  let server: http.Server
  const port = 9899

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-err-fb-'))
    const distDir = join(tmpDir, 'dist')
    mkdirSync(distDir, { recursive: true })
    mkdirSync(join(distDir, 'client'), { recursive: true })

    // No _error.js file — module import will fail
    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify({ pages: {}, apis: {} }))
    writeFileSync(join(distDir, 'routes.json'), JSON.stringify({
      pages: [],
      apis: [],
      errorPage: { filePath: '_error' },
    }))

    const config = {
      adapter: {
        name: 'test',
        extensions: ['.js'],
        render: async () => '<div>should not appear</div>',
      },
    }

    server = await createProdServer({ distDir, appShell: join(tmpDir, 'app.html'), config: config as any })
    await new Promise<void>(resolve => server.listen(port, resolve))
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('falls back to default error page when _error.js module does not exist', async () => {
    const res = await fetch(`http://localhost:${port}/nowhere`)
    expect(res.status).toBe(404)
    const text = await res.text()
    expect(text).toContain('<h1>404</h1>')
  })
})

describe('createProdServer with error page and no adapter', () => {
  let tmpDir: string
  let server: http.Server
  const port = 9900

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-err-no-adptr-'))
    const distDir = join(tmpDir, 'dist')
    mkdirSync(distDir, { recursive: true })
    mkdirSync(join(distDir, 'client'), { recursive: true })

    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify({ pages: {}, apis: {} }))
    writeFileSync(join(distDir, 'routes.json'), JSON.stringify({
      pages: [],
      apis: [],
      errorPage: { filePath: '_error' },
    }))

    server = await createProdServer({ distDir, appShell: join(tmpDir, 'app.html') })
    await new Promise<void>(resolve => server.listen(port, resolve))
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns default error page when no adapter is configured', async () => {
    const res = await fetch(`http://localhost:${port}/nope`)
    expect(res.status).toBe(404)
    const text = await res.text()
    expect(text).toContain('<h1>404</h1>')
  })
})

describe('createProdServer with image TTL config', () => {
  let tmpDir: string
  let server: http.Server
  const port = 9894

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vitella-img-ttl-'))
    const distDir = join(tmpDir, 'dist')
    mkdirSync(distDir, { recursive: true })
    mkdirSync(join(distDir, 'client'), { recursive: true })

    writeFileSync(join(distDir, 'manifest.json'), JSON.stringify({ pages: {}, apis: {} }))

    // Create a test image in the assets directory
    const clientAssets = join(distDir, 'client', 'assets')
    mkdirSync(clientAssets, { recursive: true })
    writeFileSync(join(clientAssets, 'logo.png'), 'fake-png-data')

    server = await createProdServer({
      distDir,
      appShell: join(tmpDir, 'app.html'),
      config: { ttl: { images: 3600 } } as any,
    })
    await new Promise<void>(resolve => server.listen(port, resolve))
  })

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve))
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('sets Cache-Control for images when ttl.images is configured', async () => {
    const res = await fetch(`http://localhost:${port}/assets/logo.png`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')
  })
})
