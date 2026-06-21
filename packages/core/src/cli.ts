#!/usr/bin/env node
import { createServer as createViteDevServer } from 'vite'
import { resolve } from 'path'
import fs from 'fs'
import path from 'path'
import { vitellaPlugin } from './index.js'
import { createProdServer } from './prod-server.js'
import { buildRouteManifest } from './route-manifest.js'
import { generateBuildManifest } from './build.js'
import { safeName } from './response-utils.js'

const command = process.argv[2]

async function detectAdapterPackages(root: string): Promise<string[]> {
  try {
    const pkg = JSON.parse(fs.readFileSync(resolve(root, 'package.json'), 'utf-8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    return Object.keys(deps).filter(n => n.startsWith('@vitella-ssr/') && n !== '@vitella-ssr/core')
  } catch {}
  return []
}

async function adapterForPackage(name: string): Promise<unknown> {
  if (!name) return undefined
  const mod = await import(name)
  for (const key of Object.keys(mod)) {
    if (key.endsWith('Adapter') || key.endsWith('adapter')) {
      return mod[key]
    }
  }
  return undefined
}

async function getAdapter(): Promise<any> {
  const adapterPkgs = await detectAdapterPackages(process.cwd())
  for (const pkg of adapterPkgs) {
    const adapter = await adapterForPackage(pkg)
    if (adapter) return adapter
  }
  return undefined
}

async function extractTtlFromViteConfig(root: string): Promise<{ images?: number; pages?: number } | undefined> {
  const candidates = [
    resolve(root, 'vite.config.js'),
    resolve(root, 'vite.config.ts'),
    resolve(root, 'vite.config.mjs'),
    resolve(root, 'vite.config.mts'),
  ]
  for (const configPath of candidates) {
    if (!fs.existsSync(configPath)) continue
    try {
      const source = fs.readFileSync(configPath, 'utf-8')
      const ttlMatch = source.match(/ttl\s*:\s*\{([^}]+)\}/)
      if (!ttlMatch) return undefined
      const body = ttlMatch[1]
      const images = body.match(/images\s*:\s*(\d+)/)
      const pages = body.match(/pages\s*:\s*(\d+)/)
      const result: { images?: number; pages?: number } = {}
      if (images) result.images = parseInt(images[1], 10)
      if (pages) result.pages = parseInt(pages[1], 10)
      return Object.keys(result).length > 0 ? result : undefined
    } catch {}
  }
  return undefined
}

async function main() {
  const root = process.cwd()

  switch (command) {
    case 'dev': {
      const server = await createViteDevServer({
        root,
        plugins: [vitellaPlugin()],
        appType: 'custom',
      })
      await server.listen()
      server.printUrls()
      break
    }

    case 'build': {
      const { build } = await import('vite')
      const pagesDir = resolve(root, 'src/pages')
      const serverDir = resolve(root, 'src/server')
      const routeManifest = buildRouteManifest(pagesDir, serverDir)

      const entriesDir = resolve(root, '.vitella', 'entries', 'pages')
      fs.mkdirSync(entriesDir, { recursive: true })

      const clientInputs: Record<string, string> = {}
      const adapter = await getAdapter()

      if (adapter?.getClientEntry) {
        for (const page of routeManifest.pages) {
          const safe = safeName(page.path, 'index')
          const entryPath = resolve(entriesDir, `${safe}.js`)
          const entrySource = adapter.getClientEntry(page.path, page.filePath)
          fs.writeFileSync(entryPath, entrySource, 'utf-8')
          clientInputs[safe] = entryPath
        }
      }

      console.log('Building client...')
      const clientExtra = Object.keys(clientInputs).length > 0
        ? { rollupOptions: { input: clientInputs } }
        : {}
      await build({ root, build: { outDir: 'dist/client', ...clientExtra } })

      console.log('Building server...')
      const ssrInput: Record<string, string> = {}
      for (const page of routeManifest.pages) {
        const safe = safeName(page.path, 'index')
        ssrInput[safe] = page.filePath
      }
      for (const layoutPath of [...new Set(routeManifest.pages.filter(p => p.layout).map(p => p.layout!))]) {
        const layoutSafe = safeName(layoutPath.replace(/\.[^/.]+$/, ''), '_layout')
        ssrInput[layoutSafe] = layoutPath
      }
      for (const api of routeManifest.apis) {
        const safe = safeName(api.path, 'api_index')
        ssrInput[safe] = api.filePath
      }

      await build({
        root,
        build: {
          ssr: true,
          outDir: 'dist/server',
          rollupOptions: { input: ssrInput },
        },
      })

      const adapterPkgs = await detectAdapterPackages(root)
      const buildConfig: Record<string, unknown> = { appShell: 'src/app.html' }
      if (adapterPkgs.length > 0) {
        buildConfig.adapterPackages = adapterPkgs
        buildConfig.adapter = adapterPkgs[0]
      }

      const ttl = await extractTtlFromViteConfig(root)
      if (ttl) buildConfig.ttl = ttl

      fs.writeFileSync(resolve(root, 'dist/config.json'), JSON.stringify(buildConfig, null, 2))

      const assetsDir = resolve(root, 'src/assets')
      if (fs.existsSync(assetsDir)) {
        const distAssetsDir = resolve(root, 'dist/client/assets')
        fs.mkdirSync(distAssetsDir, { recursive: true })
        fs.cpSync(assetsDir, distAssetsDir, { recursive: true })
        console.log('Assets copied to dist/client/assets/')
      }

      const buildManifest = generateBuildManifest(routeManifest)

      const clientManifestPath = resolve(root, 'dist', 'client', '.vite', 'manifest.json')
      if (fs.existsSync(clientManifestPath)) {
        const clientManifest = JSON.parse(fs.readFileSync(clientManifestPath, 'utf-8'))
        for (const [pagePath, entry] of Object.entries(buildManifest.pages)) {
          const safe = safeName(pagePath, 'index')
          const viteEntry = clientManifest[`assets/${safe}.js`]
          if (viteEntry?.css) {
            entry.css = viteEntry.css
          }
        }
      }

      fs.writeFileSync(resolve(root, 'dist/manifest.json'), JSON.stringify(buildManifest, null, 2))
      const routeData = {
        pages: routeManifest.pages.map(r => ({ path: r.path, paramNames: r.paramNames, type: r.type, layout: r.layout })),
        apis: routeManifest.apis.map(r => ({ path: r.path, paramNames: r.paramNames, type: r.type })),
      }
      fs.writeFileSync(resolve(root, 'dist/routes.json'), JSON.stringify(routeData, null, 2))

      console.log('Build complete')
      break
    }

    case 'start': {
      const distDir = resolve(root, 'dist')
      const appShell = resolve(root, 'src', 'app.html')
      let config: { adapter?: unknown; appShell?: string; ttl?: { images?: number; pages?: number }; adapterPackages?: string[] } | undefined

      try {
        const buildConfig = JSON.parse(fs.readFileSync(resolve(distDir, 'config.json'), 'utf-8'))
        const pkgs: string[] = buildConfig.adapterPackages || (buildConfig.adapter ? [buildConfig.adapter] : [])
        for (const pkgName of pkgs) {
          const adapter = await adapterForPackage(pkgName)
          if (adapter) {
            config = { adapter, appShell: buildConfig.appShell || appShell }
            if (buildConfig.ttl) config.ttl = buildConfig.ttl
            break
          }
        }
      } catch {}

      const server = await createProdServer({
        distDir,
        appShell: config?.appShell || appShell,
        config: config as any,
      })
      const port = parseInt(process.env.PORT || '3000', 10)
      server.listen(port, () => {
        console.log(`Production server running on http://localhost:${port}`)
      })
      break
    }

    default: {
      console.log('Usage: vitella <dev|build|start>')
      process.exit(1)
    }
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
