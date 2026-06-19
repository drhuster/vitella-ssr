import type { VitellaConfig } from './types.js'

export interface ResolvedVitellaConfig extends Required<Pick<VitellaConfig, 'pagesDir' | 'serverDir' | 'appShell' | 'assetsDir'>> {
  middleware: NonNullable<VitellaConfig['middleware']>
  adapter: VitellaConfig['adapter']
}

export async function resolveConfig(userConfig?: Partial<VitellaConfig>): Promise<ResolvedVitellaConfig> {
  return {
    pagesDir: userConfig?.pagesDir ?? 'src/pages',
    serverDir: userConfig?.serverDir ?? 'src/server',
    appShell: userConfig?.appShell ?? 'src/app.html',
    assetsDir: userConfig?.assetsDir ?? 'src/assets',
    middleware: userConfig?.middleware ?? [],
    adapter: userConfig?.adapter ?? undefined,
  }
}
