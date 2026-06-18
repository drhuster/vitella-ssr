#!/usr/bin/env node
import { createServer as createViteDevServer } from 'vite'
import { resolve } from 'path'
import fs from 'fs'
import { vitellaPlugin } from './index.js'
import { createProdServer } from './prod-server.js'
import { buildRouteManifest } from './route-manifest.js'
import { generateBuildManifest } from './build.js'

const command = process.argv[2]

async function detectAdapterPackage(root: string): Promise<string | undefined> {
  try {
    const pkg = JSON.parse(fs.readFileSync(resolve(root, 'package.json'), 'utf-8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    for (const [name] of Object.entries(deps)) {
      if (name === '@vitella-ssr/vue') return name
    }
  } catch {}
  return undefined
}

async function adapterForPackage(name: string): Promise<unknown> {
  if (!name) return undefined
  const mod = await import(name)
  return mod.vueAdapter || mod.piniaAdapter || undefined
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

      // Build client
      console.log('Building client...')
      await build({ root, build: { outDir: 'dist/client' } })

      // Build server (SSR multi-entry)
      console.log('Building server...')
      const ssrInput: Record<string, string> = {}
      for (const page of routeManifest.pages) {
        const safeName = page.path.replace(/\//g, '_').replace(/:/g, '_').replace(/^_/, '') || 'index'
        ssrInput[safeName] = page.filePath
      }
      for (const api of routeManifest.apis) {
        const safeName = api.path.replace(/\//g, '_').replace(/:/g, '_').replace(/^_/, '') || 'api_index'
        ssrInput[safeName] = api.filePath
      }

      await build({
        root,
        build: {
          ssr: true,
          outDir: 'dist/server',
          rollupOptions: { input: ssrInput },
        },
      })

      // Save config for production server
      const adapterPkg = await detectAdapterPackage(root)
      const buildConfig: Record<string, unknown> = { appShell: 'src/app.html' }
      if (adapterPkg) buildConfig.adapter = adapterPkg
      fs.writeFileSync(resolve(root, 'dist/config.json'), JSON.stringify(buildConfig, null, 2))

      // Generate manifests
      const buildManifest = generateBuildManifest(routeManifest)
      fs.writeFileSync(resolve(root, 'dist/manifest.json'), JSON.stringify(buildManifest, null, 2))
      const routeData = {
        pages: routeManifest.pages.map(r => ({ path: r.path, paramNames: r.paramNames, type: r.type })),
        apis: routeManifest.apis.map(r => ({ path: r.path, paramNames: r.paramNames, type: r.type })),
      }
      fs.writeFileSync(resolve(root, 'dist/routes.json'), JSON.stringify(routeData, null, 2))

      console.log('Build complete')
      break
    }

    case 'start': {
      const distDir = resolve(root, 'dist')
      const appShell = resolve(root, 'src', 'app.html')
      let config: { adapter?: unknown; appShell?: string } | undefined

      try {
        const buildConfig = JSON.parse(fs.readFileSync(resolve(distDir, 'config.json'), 'utf-8'))
        if (buildConfig.adapter) {
          const adapter = await adapterForPackage(buildConfig.adapter)
          config = { adapter, appShell: buildConfig.appShell || appShell }
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
