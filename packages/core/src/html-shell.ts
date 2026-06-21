import { readFileSync } from 'fs'

const shellCache = new Map<string, string>()
const MAX_CACHE_SIZE = 10

export function loadHtmlShell(shellPath: string): string {
  if (shellCache.has(shellPath)) {
    const cached = shellCache.get(shellPath)!
    shellCache.delete(shellPath)
    shellCache.set(shellPath, cached)
    return cached
  }
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
      .map(src => `<script type="module" src="${escapeAttr(src)}"></script>`)
      .join('\n  ')
    result = result.replace('<!--vitella-scripts-->', scriptTags)
  } else {
    result = result.replace('<!--vitella-scripts-->', '')
  }

  return result
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function renderDefaultErrorPage(
  statusCode: number,
  statusMessage: string,
  url: string
): string {
  const safeMessage = escapeHtml(statusMessage)
  const safeUrl = escapeHtml(url)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${statusCode} - ${safeMessage}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .error { text-align: center; }
    .error h1 { font-size: 6rem; margin: 0; color: #e74c3c; }
    .error p { font-size: 1.2rem; color: #666; }
    .error .url { font-size: 0.9rem; color: #999; margin-top: 1rem; }
  </style>
</head>
<body>
  <div class="error">
    <h1>${statusCode}</h1>
    <p>${safeMessage}</p>
    ${safeUrl ? `<p class="url">${safeUrl}</p>` : ''}
  </div>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
