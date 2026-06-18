import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { buildRouteManifest } from '../src/route-manifest.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vitella-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('buildRouteManifest', () => {
  it('scans pages directory and returns manifest', () => {
    const pagesDir = join(tmpDir, 'pages')
    mkdirSync(pagesDir, { recursive: true })
    writeFileSync(join(pagesDir, 'index.vue'), '')
    writeFileSync(join(pagesDir, 'about.vue'), '')

    const manifest = buildRouteManifest(pagesDir)
    expect(manifest.pages).toHaveLength(2)
    expect(manifest.pages.find(r => r.path === '/')).toBeTruthy()
    expect(manifest.pages.find(r => r.path === '/about')).toBeTruthy()
  })

  it('handles nested directories', () => {
    const pagesDir = join(tmpDir, 'pages')
    mkdirSync(join(pagesDir, 'blog'), { recursive: true })
    writeFileSync(join(pagesDir, 'blog', 'index.vue'), '')
    writeFileSync(join(pagesDir, 'blog', '[slug].vue'), '')

    const manifest = buildRouteManifest(pagesDir)
    expect(manifest.pages.find(r => r.path === '/blog')).toBeTruthy()
    expect(manifest.pages.find(r => r.path === '/blog/:slug')).toBeTruthy()
  })

  it('extracts dynamic param names from [slug] files', () => {
    const pagesDir = join(tmpDir, 'pages')
    mkdirSync(join(pagesDir, 'users'), { recursive: true })
    writeFileSync(join(pagesDir, 'users', '[id].vue'), '')

    const manifest = buildRouteManifest(pagesDir)
    const route = manifest.pages.find(r => r.path === '/users/:id')
    expect(route?.paramNames).toEqual(['id'])
  })

  it('root route pattern matches "/"', () => {
    const pagesDir = join(tmpDir, 'pages')
    mkdirSync(pagesDir, { recursive: true })
    writeFileSync(join(pagesDir, 'index.vue'), '')

    const manifest = buildRouteManifest(pagesDir)
    const rootRoute = manifest.pages.find(r => r.path === '/')
    expect(rootRoute).toBeTruthy()
    expect(rootRoute!.pattern.test('/')).toBe(true)
    expect(rootRoute!.pattern.test('/?foo=bar')).toBe(true)
  })

  it('scans server directory and generates /api routes', () => {
    const srcDir = join(tmpDir, 'src')
    const pagesDir = join(srcDir, 'pages')
    const serverDir = join(srcDir, 'server')
    mkdirSync(pagesDir, { recursive: true })
    mkdirSync(serverDir, { recursive: true })
    writeFileSync(join(pagesDir, 'index.vue'), '')
    writeFileSync(join(serverDir, 'hello.js'), '')
    writeFileSync(join(serverDir, 'users.js'), '')

    const manifest = buildRouteManifest(pagesDir)
    expect(manifest.apis).toHaveLength(2)
    expect(manifest.apis.find(r => r.path === '/api/hello')).toBeTruthy()
    expect(manifest.apis.find(r => r.path === '/api/users')).toBeTruthy()
  })

  it('accepts custom page extensions', () => {
    const pagesDir = join(tmpDir, 'pages')
    mkdirSync(pagesDir, { recursive: true })
    writeFileSync(join(pagesDir, 'index.js'), '')
    writeFileSync(join(pagesDir, 'about.js'), '')

    const manifest = buildRouteManifest(pagesDir, undefined, ['.js', '.ts'])
    expect(manifest.pages).toHaveLength(2)
    expect(manifest.pages.find(r => r.path === '/')).toBeTruthy()
    expect(manifest.pages.find(r => r.path === '/about')).toBeTruthy()
  })

  it('filters page files by custom extensions when specified', () => {
    const pagesDir = join(tmpDir, 'pages')
    mkdirSync(pagesDir, { recursive: true })
    writeFileSync(join(pagesDir, 'index.vue'), '')
    writeFileSync(join(pagesDir, 'secret.js'), '')

    const manifest = buildRouteManifest(pagesDir, undefined, ['.vue'])
    expect(manifest.pages).toHaveLength(1)
    expect(manifest.pages.find(r => r.path === '/')).toBeTruthy()
  })

  it('accepts explicit serverDir parameter', () => {
    const pagesDir = join(tmpDir, 'pages')
    const serverDir = join(tmpDir, 'api-routes')
    mkdirSync(pagesDir, { recursive: true })
    mkdirSync(serverDir, { recursive: true })
    writeFileSync(join(pagesDir, 'index.vue'), '')
    writeFileSync(join(serverDir, 'data.js'), '')

    const manifest = buildRouteManifest(pagesDir, serverDir)
    expect(manifest.apis).toHaveLength(1)
    expect(manifest.apis.find(r => r.path === '/api/data')).toBeTruthy()
  })

  it('escapes regex special characters in file/directory names', () => {
    const pagesDir = join(tmpDir, 'pages')
    mkdirSync(pagesDir, { recursive: true })
    writeFileSync(join(pagesDir, 'index.vue'), '')
    writeFileSync(join(pagesDir, 'test+.vue'), '')

    const manifest = buildRouteManifest(pagesDir)
    const route = manifest.pages.find(r => r.path === '/test+')
    expect(route).toBeTruthy()

    // The + should be literal, not a regex quantifier
    expect(route!.pattern.test('/test')).toBe(false)
    expect(route!.pattern.test('/test+')).toBe(true)
    expect(route!.pattern.test('/testplus')).toBe(false)
  })
})
