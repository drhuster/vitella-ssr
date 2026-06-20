import type { RouteManifest, BuildManifest } from './types.js'

export function generateBuildManifest(routes: RouteManifest): BuildManifest {
  const pages: BuildManifest['pages'] = {}
  const apis: BuildManifest['apis'] = {}

  for (const route of routes.pages) {
    const safeName = route.path.replace(/\//g, '_').replace(/:/g, '_').replace(/^_/, '') || 'index'
    pages[route.path] = {
      clientEntry: `client/assets/${safeName}.js`,
      serverEntry: `server/${safeName}.js`,
      css: undefined,
    }
  }

  for (const route of routes.apis) {
    const safeName = route.path.replace(/\//g, '_').replace(/:/g, '_').replace(/^_/, '') || 'api_index'
    apis[route.path] = {
      serverEntry: `server/${safeName}.js`,
    }
  }

  if (routes.errorPage) {
    pages['__error__'] = {
      clientEntry: `client/assets/_error.js`,
      serverEntry: `server/_error.js`,
      css: undefined,
    }
  }

  return { pages, apis }
}
