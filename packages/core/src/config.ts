import type { VitellaConfig } from './types.js'

export interface ResolvedVitellaConfig extends Required<Pick<VitellaConfig, 'pagesDir' | 'serverDir' | 'appShell' | 'assetsDir' | 'ttl'>> {
  middleware: NonNullable<VitellaConfig['middleware']>
  adapter: VitellaConfig['adapter']
  securityHeaders?: Record<string, string>
}

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
