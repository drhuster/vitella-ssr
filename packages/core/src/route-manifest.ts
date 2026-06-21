/**
 * Route manifest builder for Vitella SSR.
 *
 * Scans the filesystem's src/pages and src/server directories to discover
 * page routes (file-system based routing), API routes (prefixed with /api),
 * hierarchical layout files (_layout), and custom error pages (_error).
 *
 * Route patterns use [param] syntax for dynamic segments, and layouts
 * are resolved by walking upward through the directory tree.
 */

import { readdirSync, statSync } from 'fs'
import { join, extname, basename, dirname } from 'path'
import type { Route, RouteManifest } from './types.js'

const API_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx']
const PAGE_EXTENSIONS = ['.vue', '.js', '.ts', '.jsx', '.tsx']

/** Escape special regex characters in a string for literal matching. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Scan the filesystem and build the complete route manifest (pages, APIs, error page, layouts). */
export function buildRouteManifest(
  pagesDir: string,
  serverDir?: string,
  pageExtensions?: string[]
): RouteManifest {
  const pages: Route[] = []
  const apis: Route[] = []
  const layoutCache = new Map<string, string | null>()

  /**
   * Walk up from the given directory to find the nearest _layout file.
   * Results are cached to avoid repeated filesystem access.
   */
  function resolveLayout(dir: string, exts: string[]): string | undefined {
    let current = dir
    while (true) {
      const cached = layoutCache.get(current)
      if (cached !== undefined) {
        if (current !== dir) layoutCache.set(dir, cached)
        return cached || undefined
      }
      for (const ext of exts) {
        const layoutPath = join(current, `_layout${ext}`)
        try {
          if (statSync(layoutPath).isFile()) {
            layoutCache.set(current, layoutPath)
            if (current !== dir) layoutCache.set(dir, layoutPath)
            return layoutPath
          }
        } catch {}
      }
      const parent = dirname(current)
      if (parent === current) {
        layoutCache.set(dir, null)
        return undefined
      }
      current = parent
    }
  }

  /** Recursively scan a directory, building Route objects from files. */
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
        // Skip special files — they're handled separately.
        if (type === 'page' && (name === '_layout' || name === '_error')) continue

        let urlPath = name === 'index' ? baseUrl || '/' : `${baseUrl}/${name}`
        if (urlPath === '') urlPath = '/'

        // Extract named params from [param] syntax and convert to :param pattern.
        const paramNames: string[] = []
        const pathStr = urlPath.replace(/\[([^\]]+)\]/g, (_, p) => { paramNames.push(p); return `:${p}` })

        // Build the regex pattern for matching — dynamic segments become capture groups.
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
          layout: type === 'page' ? resolveLayout(dir, validExts) : undefined,
          type: type as 'page' | 'api',
        }
        ;(type === 'page' ? pages : apis).push(route)
      }
    }
  }

  scan(pagesDir, '', 'page')

  const resolvedServerDir = serverDir || join(dirname(pagesDir), 'server')
  scan(resolvedServerDir, '/api', 'api')

  // Look for a custom _error page file.
  let errorPagePath: string | undefined
  let errorPageLayout: string | undefined
  const errorExts = pageExtensions || PAGE_EXTENSIONS
  for (const ext of errorExts) {
    const errorPath = join(pagesDir, `_error${ext}`)
    try {
      if (statSync(errorPath).isFile()) {
        errorPagePath = errorPath
        break
      }
    } catch {}
  }
  if (errorPagePath) {
    errorPageLayout = resolveLayout(dirname(errorPagePath), pageExtensions || PAGE_EXTENSIONS)
  }

  return {
    pages,
    apis,
    errorPage: errorPagePath
      ? { filePath: errorPagePath, layout: errorPageLayout }
      : undefined,
  }
}
