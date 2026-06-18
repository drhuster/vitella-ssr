import { readdirSync, statSync } from 'fs'
import { join, extname, basename, dirname } from 'path'
import type { Route, RouteManifest } from './types.js'

const API_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx']
const PAGE_EXTENSIONS = ['.vue', '.js', '.ts', '.jsx', '.tsx']

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildRouteManifest(
  pagesDir: string,
  serverDir?: string,
  pageExtensions?: string[]
): RouteManifest {
  const pages: Route[] = []
  const apis: Route[] = []

  function scan(dir: string, baseUrl: string, type: 'page' | 'api'): void {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }

    const validExts = type === 'page' ? (pageExtensions || PAGE_EXTENSIONS) : API_EXTENSIONS

    for (const entry of entries) {
      const fullPath = join(dir, entry)
      const stat = statSync(fullPath)

      if (stat.isDirectory()) {
        scan(fullPath, `${baseUrl}/${entry}`, type)
      } else {
        const ext = extname(entry)
        if (!validExts.includes(ext)) continue

        const name = basename(entry, ext)
        let urlPath = name === 'index' ? baseUrl || '/' : `${baseUrl}/${name}`
        if (urlPath === '') urlPath = '/'

        const paramNames: string[] = []
        const pathStr = urlPath.replace(/\[([^\]]+)\]/g, (_, p) => { paramNames.push(p); return `:${p}` })

        const patternStr = pathStr === '/'
          ? '/'
          : pathStr
            .replace(/:([^/]+)/g, '\x00$1\x00')
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\x00([^\x00]+)\x00/g, '([^/]+)')
            .replace(/\/$/, '')

        const pattern = new RegExp(`^${patternStr}(\\?.*)?$`)

        const route: Route = {
          path: pathStr,
          pattern,
          paramNames,
          filePath: fullPath,
          type: type as 'page' | 'api',
        }
        ;(type === 'page' ? pages : apis).push(route)
      }
    }
  }

  scan(pagesDir, '', 'page')

  const resolvedServerDir = serverDir || join(dirname(pagesDir), 'server')
  scan(resolvedServerDir, '/api', 'api')

  return { pages, apis }
}
