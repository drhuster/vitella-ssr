import { readFileSync } from 'fs'

const shellCache = new Map<string, string>()
const MAX_CACHE_SIZE = 10

export function loadHtmlShell(shellPath: string): string {
  if (shellCache.has(shellPath)) return shellCache.get(shellPath)!
  if (shellCache.size >= MAX_CACHE_SIZE) {
    const firstKey = shellCache.keys().next().value
    if (firstKey) shellCache.delete(firstKey)
  }
  const content = readFileSync(shellPath, 'utf-8')
  shellCache.set(shellPath, content)
  return content
}

export function renderHtmlShell(
  template: string,
  options: {
    html: string
    title?: string
    head?: string
    state?: Record<string, unknown>
    scripts?: string[]
  }
): string {
  let result = template
    .replace('<!--vitella-html-->', options.html)
    .replace('<!--vitella-title-->', options.title ?? '')
    .replace('<!--vitella-head-->', options.head ?? '')

  if (options.state) {
    const serialized = JSON.stringify(options.state).replace(/<\//g, '<\\/')
    const stateScript = `<script>window.__INITIAL_STATE__ = ${serialized}</script>`
    result = result.replace('<!--vitella-state-->', stateScript)
  } else {
    result = result.replace('<!--vitella-state-->', '')
  }

  if (options.scripts?.length) {
    const scriptTags = options.scripts
      .map(src => `<script type="module" src="${src.replace(/"/g, '&quot;')}"></script>`)
      .join('\n  ')
    result = result.replace('<!--vitella-scripts-->', scriptTags)
  } else {
    result = result.replace('<!--vitella-scripts-->', '')
  }

  return result
}
