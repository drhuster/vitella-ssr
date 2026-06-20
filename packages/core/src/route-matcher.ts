import type { Route } from './types.js'

export function matchRoute(url: string, routes: Route[]): { route: Route; params: Record<string, string> } | null {
  const pathname = url.split('?')[0].split('#')[0]

  for (const route of routes) {
    if (!route.pattern.test(pathname)) continue
    const match = pathname.match(route.pattern)
    if (match) {
      const params: Record<string, string> = {}
      route.paramNames.forEach((name, i) => {
        params[name] = match[i + 1]
      })
      return { route, params }
    }
  }

  return null
}
