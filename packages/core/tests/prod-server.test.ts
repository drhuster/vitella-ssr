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

    // Use http.get with raw path to bypass fetch() URL normalization
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
