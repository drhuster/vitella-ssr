import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { renderHtmlShell, loadHtmlShell, renderDefaultErrorPage } from '../src/html-shell.js'

describe('loadHtmlShell', () => {
  it('reads and caches the app.html file', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'vitella-test-'))
    const shellPath = join(tmpDir, 'app.html')
    writeFileSync(shellPath, '<html><!--vitella-html--></html>')
    expect(loadHtmlShell(shellPath)).toBe('<html><!--vitella-html--></html>')
    rmSync(tmpDir, { recursive: true, force: true })
  })
})

describe('renderHtmlShell', () => {
  it('replaces <!--vitella-html-->', () => {
    const result = renderHtmlShell('<html><!--vitella-html--></html>', {
      html: '<div>content</div>',
    })
    expect(result).toBe('<html><div>content</div></html>')
  })

  it('replaces <!--vitella-title-->', () => {
    const result = renderHtmlShell('<html><title><!--vitella-title--></title><!--vitella-html--></html>', {
      title: 'My Page',
      html: '',
    })
    expect(result).toContain('<title>My Page</title>')
  })

  it('replaces <!--vitella-head-->', () => {
    const result = renderHtmlShell('<html><head><!--vitella-head--></head><body><!--vitella-html--></body></html>', {
      head: '<meta name="description" content="test">',
      html: '',
    })
    expect(result).toContain('<meta name="description" content="test">')
  })

  it('replaces <!--vitella-state-->', () => {
    const result = renderHtmlShell('<html><body><!--vitella-html--><!--vitella-state--></body></html>', {
      html: '<div>ok</div>',
      state: { key: 'value' },
    })
    expect(result).toContain('<script>window.__INITIAL_STATE__')
    expect(result).toContain('"key":"value"')
  })

  it('replaces <!--vitella-scripts-->', () => {
    const result = renderHtmlShell('<html><body><!--vitella-html--><!--vitella-scripts--></body></html>', {
      html: '',
      scripts: ['/assets/index.js'],
    })
    expect(result).toContain('<script type="module" src="/assets/index.js"></script>')
  })

  it('handles state as empty when not provided', () => {
    const result = renderHtmlShell('<html><!--vitella-html--><!--vitella-state--></html>', {
      html: '<div>ok</div>',
    })
    expect(result).not.toContain('__INITIAL_STATE__')
  })

  it('handles scripts as empty when not provided', () => {
    const result = renderHtmlShell('<html><!--vitella-html--><!--vitella-scripts--></html>', {
      html: '<div>ok</div>',
    })
    expect(result).not.toContain('<script')
  })

  it('escapes </script> in state to prevent XSS', () => {
    const result = renderHtmlShell('<html><!--vitella-html--><!--vitella-state--></html>', {
      html: '',
      state: { x: '</script><script>alert(1)' },
    })
    expect(result).not.toContain('</script><script>')
    expect(result).toContain('<\\/script>')
  })

  it('escapes </script> even when at start of state values', () => {
    const result = renderHtmlShell('<html><!--vitella-html--><!--vitella-state--></html>', {
      html: '',
      state: { x: '</script>' },
    })
    expect(result).not.toContain('"</script>"')
    expect(result).toContain('"<\\/script>"')
  })

  it('escapes <\\/SCRIPT> (uppercase) in state', () => {
    const result = renderHtmlShell('<html><!--vitella-html--><!--vitella-state--></html>', {
      html: '',
      state: { x: '</SCRIPT>' },
    })
    expect(result).not.toContain('</SCRIPT>')
    expect(result).toContain('<\\/SCRIPT>')
  })

  it('escapes </script> in object keys', () => {
    const result = renderHtmlShell('<html><!--vitella-html--><!--vitella-state--></html>', {
      html: '',
      state: { '</script>': 'value' },
    })
    expect(result).not.toContain('"</script>')
    expect(result).toContain('"<\\/script>')
  })

  it('produces full HTML from a realistic template', () => {
    const template = '<!DOCTYPE html><html><head><title><!--vitella-title--></title><!--vitella-head--></head><body><!--vitella-html--><!--vitella-state--><!--vitella-scripts--></body></html>'
    const result = renderHtmlShell(template, {
      title: 'Test',
      head: '<meta charset="utf-8">',
      html: '<div>hello</div>',
      state: { count: 1 },
      scripts: ['/main.js'],
    })
    expect(result).toContain('<!DOCTYPE html>')
    expect(result).toContain('<title>Test</title>')
    expect(result).toContain('<meta charset="utf-8">')
    expect(result).toContain('<div>hello</div>')
    expect(result).toContain('"count":1')
    expect(result).toContain('src="/main.js"')
  })
})

describe('renderDefaultErrorPage', () => {
  it('renders 404 page with status code and message', () => {
    const html = renderDefaultErrorPage(404, 'Not Found', '/missing')
    expect(html).toContain('404')
    expect(html).toContain('Not Found')
    expect(html).toContain('/missing')
  })

  it('renders 500 page with status code and message', () => {
    const html = renderDefaultErrorPage(500, 'Internal Server Error', '/broken')
    expect(html).toContain('500')
    expect(html).toContain('Internal Server Error')
    expect(html).toContain('/broken')
  })

  it('handles empty URL', () => {
    const html = renderDefaultErrorPage(404, 'Not Found', '')
    expect(html).toContain('404')
    expect(html).toContain('Not Found')
  })

  it('escapes HTML in status message', () => {
    const html = renderDefaultErrorPage(500, '<script>alert("xss")</script>', '/test')
    expect(html).not.toContain('<script>')
  })

  it('returns a complete HTML document', () => {
    const html = renderDefaultErrorPage(404, 'Not Found', '/test')
    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toContain('</html>')
  })
})
