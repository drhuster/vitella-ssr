import type { RouteManifest, BuildManifest } from './types.js'
import { safeName } from './response-utils.js'

export function generateBuildManifest(routes: RouteManifest): BuildManifest {
  const pages: BuildManifest['pages'] = {}
  const apis: BuildManifest['apis'] = {}

  for (const route of routes.pages) {
    const safe = safeName(route.path, 'index')
    pages[route.path] = {
      clientEntry: `client/assets/${safe}.js`,
      serverEntry: `server/${safe}.js`,
      css: undefined,
    }
  }

  for (const route of routes.apis) {
    const safe = safeName(route.path, 'api_index')
    apis[route.path] = {
      serverEntry: `server/${safe}.js`,
    }
  }

  if (routes.errorPage) {
    pages['__error__'] = {
      clientEntry: 'client/assets/_error.js',
      serverEntry: 'server/_error.js',
      css: undefined,
    }
  }

  return { pages, apis }
}
