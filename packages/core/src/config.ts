/**
 * Configuration resolution for Vitella SSR.
 *
 * Takes the user's partial configuration and fills in sensible defaults
 * for all required fields. The resolved config is used throughout the
 * framework's dev server, build pipeline, and production server.
 */

import type { VitellaConfig } from './types.js'

/** Fully resolved configuration with all optional fields given defaults. */
export interface ResolvedVitellaConfig extends Required<Pick<VitellaConfig, 'pagesDir' | 'serverDir' | 'appShell' | 'assetsDir' | 'ttl'>> {
  middleware: NonNullable<VitellaConfig['middleware']>
  adapter: VitellaConfig['adapter']
  securityHeaders?: Record<string, string>
}

/** Merge user-provided config with framework defaults. */
export async function resolveConfig(userConfig?: Partial<VitellaConfig>): Promise<ResolvedVitellaConfig> {
  return {
    pagesDir: userConfig?.pagesDir ?? 'src/pages',
    serverDir: userConfig?.serverDir ?? 'src/server',
    appShell: userConfig?.appShell ?? 'src/app.html',
    assetsDir: userConfig?.assetsDir ?? 'src/assets',
    middleware: userConfig?.middleware ?? [],
    adapter: userConfig?.adapter ?? undefined,
    ttl: {
      images: userConfig?.ttl?.images ?? 0,
      pages: userConfig?.ttl?.pages ?? 0,
    },
    securityHeaders: userConfig?.securityHeaders ?? undefined,
  }
}
