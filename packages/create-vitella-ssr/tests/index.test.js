import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { validateProjectName, copyAndSubstitute, TEMPLATES_DIR, main, prompt } from '../src/index.js'

let tmpDir

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vitella-create-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function createTemplate(dir, files) {
  mkdirSync(dir, { recursive: true })
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = join(dir, filePath)
    mkdirSync(join(fullPath, '..'), { recursive: true })
    writeFileSync(fullPath, content)
  }
}

function collectFiles(dir) {
  const result = {}
  const entries = readdirSync(dir, { withFileTypes: true, recursive: true })
  for (const entry of entries) {
    if (entry.isFile()) {
      const filePath = join(entry.parentPath, entry.name)
      const relPath = filePath.replace(dir + '/', '')
      result[relPath] = readFileSync(filePath, 'utf-8')
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// validateProjectName
// ---------------------------------------------------------------------------

describe('validateProjectName', () => {
  it('accepts simple hyphenated names', () => {
    expect(() => validateProjectName('my-app')).not.toThrow()
  })

  it('accepts names with underscores', () => {
    expect(() => validateProjectName('my_app')).not.toThrow()
  })

  it('accepts names with dots', () => {
    expect(() => validateProjectName('my.app')).not.toThrow()
  })

  it('accepts names with numbers', () => {
    expect(() => validateProjectName('my-app-1')).not.toThrow()
  })

  it('accepts PascalCase names', () => {
    expect(() => validateProjectName('MyApp')).not.toThrow()
  })

  it('accepts single character names', () => {
    expect(() => validateProjectName('a')).not.toThrow()
  })

  it('rejects names with spaces', () => {
    expect(() => validateProjectName('my app')).toThrow(/Invalid project name/)
  })

  it('rejects empty string', () => {
    expect(() => validateProjectName('')).toThrow(/Invalid project name/)
  })

  it('rejects names with @ symbol', () => {
    expect(() => validateProjectName('my@app')).toThrow(/Invalid project name/)
  })

  it('rejects names with # symbol', () => {
    expect(() => validateProjectName('my#app')).toThrow(/Invalid project name/)
  })

  it('rejects names with special characters', () => {
    expect(() => validateProjectName('my$app')).toThrow(/Invalid project name/)
  })

  it('rejects names with forward slashes', () => {
    expect(() => validateProjectName('my/app')).toThrow(/Invalid project name/)
  })

  it('accepts names starting with hyphen', () => {
    expect(() => validateProjectName('-my-app')).not.toThrow()
  })

  it('accepts names starting with dot', () => {
    expect(() => validateProjectName('.my-app')).not.toThrow()
  })

  it('accepts names with underscore prefix', () => {
    expect(() => validateProjectName('_my-app')).not.toThrow()
  })

  it('rejects names with unicode characters', () => {
    expect(() => validateProjectName('ñ-app')).toThrow(/Invalid project name/)
  })

  it('rejects names with emoji', () => {
    expect(() => validateProjectName('my🚀app')).toThrow(/Invalid project name/)
  })

  it('rejects names with only special characters', () => {
    expect(() => validateProjectName('!@#$')).toThrow(/Invalid project name/)
  })
})

// ---------------------------------------------------------------------------
// prompt
// ---------------------------------------------------------------------------

describe('prompt', () => {
  it('returns trimmed answer', async () => {
    const rl = { question: async () => '  my-app  ' }
    expect(await prompt(rl, 'Name:', 'default')).toBe('my-app')
  })

  it('returns default when answer is blank', async () => {
    const rl = { question: async () => '   ' }
    expect(await prompt(rl, 'Name:', 'default')).toBe('default')
  })

  it('returns default when answer is empty string', async () => {
    const rl = { question: async () => '' }
    expect(await prompt(rl, 'Name:', 'default')).toBe('default')
  })

  it('returns actual answer when it differs from default', async () => {
    const rl = { question: async () => 'custom-name' }
    expect(await prompt(rl, 'Name:', 'default')).toBe('custom-name')
  })

  it('formats question with trailing space', async () => {
    let asked = ''
    const rl = { question: async (q) => { asked = q; return 'ans' } }
    await prompt(rl, 'Project name:', 'default')
    expect(asked).toBe('Project name: ')
  })
})

// ---------------------------------------------------------------------------
// copyAndSubstitute
// ---------------------------------------------------------------------------

describe('copyAndSubstitute', () => {
  it('copies all files from source to destination', () => {
    const srcDir = join(tmpDir, 'src-template')
    createTemplate(srcDir, {
      'package.json': '{}',
      'src/index.js': '// hello',
    })

    const destDir = join(tmpDir, 'dest')
    copyAndSubstitute(srcDir, destDir, { name: 'test' })

    expect(existsSync(join(destDir, 'package.json'))).toBe(true)
    expect(existsSync(join(destDir, 'src/index.js'))).toBe(true)
  })

  it('substitutes {{name}} with the project name', () => {
    const srcDir = join(tmpDir, 'src-template')
    createTemplate(srcDir, {
      'package.json': '{"name": "{{name}}"}',
    })

    const destDir = join(tmpDir, 'dest')
    copyAndSubstitute(srcDir, destDir, { name: 'my-project' })

    const content = readFileSync(join(destDir, 'package.json'), 'utf-8')
    expect(content).toBe('{"name": "my-project"}')
  })

  it('does NOT substitute {{ name }} (with spaces) to avoid Vue syntax collisions', () => {
    const srcDir = join(tmpDir, 'src-template')
    createTemplate(srcDir, {
      'index.vue': '<h1>{{ name }}</h1><p>{{ message }}</p>',
    })

    const destDir = join(tmpDir, 'dest')
    copyAndSubstitute(srcDir, destDir, { name: 'my-project' })

    const content = readFileSync(join(destDir, 'index.vue'), 'utf-8')
    expect(content).toBe('<h1>{{ name }}</h1><p>{{ message }}</p>')
  })

  it('substitutes empty string value', () => {
    const srcDir = join(tmpDir, 'src-template')
    createTemplate(srcDir, {
      'file.txt': 'prefix-{{name}}-suffix',
    })

    const destDir = join(tmpDir, 'dest')
    copyAndSubstitute(srcDir, destDir, { name: '' })

    const content = readFileSync(join(destDir, 'file.txt'), 'utf-8')
    expect(content).toBe('prefix--suffix')
  })

  it('handles multiple substitution keys', () => {
    const srcDir = join(tmpDir, 'src-template')
    createTemplate(srcDir, {
      'config.txt': 'project={{name}} version={{ver}}',
    })

    const destDir = join(tmpDir, 'dest')
    copyAndSubstitute(srcDir, destDir, { name: 'foo', ver: '1.0' })

    const content = readFileSync(join(destDir, 'config.txt'), 'utf-8')
    expect(content).toBe('project=foo version=1.0')
  })

  it('handles nested directories', () => {
    const srcDir = join(tmpDir, 'src-template')
    createTemplate(srcDir, {
      'a/b/c/deep.txt': '{{name}}',
    })

    const destDir = join(tmpDir, 'dest')
    copyAndSubstitute(srcDir, destDir, { name: 'deep' })

    expect(existsSync(join(destDir, 'a/b/c/deep.txt'))).toBe(true)
    const content = readFileSync(join(destDir, 'a/b/c/deep.txt'), 'utf-8')
    expect(content).toBe('deep')
  })

  it('preserves files without placeholders', () => {
    const srcDir = join(tmpDir, 'src-template')
    createTemplate(srcDir, {
      'static.txt': 'hello world',
    })

    const destDir = join(tmpDir, 'dest')
    copyAndSubstitute(srcDir, destDir, { name: 'test' })

    const content = readFileSync(join(destDir, 'static.txt'), 'utf-8')
    expect(content).toBe('hello world')
  })

  it('handles empty vars object', () => {
    const srcDir = join(tmpDir, 'src-template')
    createTemplate(srcDir, {
      'file.txt': '{{name}} stays as-is',
    })

    const destDir = join(tmpDir, 'dest')
    copyAndSubstitute(srcDir, destDir, {})

    const content = readFileSync(join(destDir, 'file.txt'), 'utf-8')
    expect(content).toBe('{{name}} stays as-is')
  })

  it('substitutes the same key appearing multiple times in a file', () => {
    const srcDir = join(tmpDir, 'src-template')
    createTemplate(srcDir, {
      'greeting.txt': 'Hello {{name}}, welcome {{name}}!',
    })

    const destDir = join(tmpDir, 'dest')
    copyAndSubstitute(srcDir, destDir, { name: 'Bob' })

    const content = readFileSync(join(destDir, 'greeting.txt'), 'utf-8')
    expect(content).toBe('Hello Bob, welcome Bob!')
  })

  it('handles an empty template directory', () => {
    const srcDir = join(tmpDir, 'empty-template')
    mkdirSync(srcDir, { recursive: true })

    const destDir = join(tmpDir, 'empty-dest')
    copyAndSubstitute(srcDir, destDir, { name: 'test' })

    expect(existsSync(destDir)).toBe(true)
    expect(readdirSync(destDir)).toHaveLength(0)
  })

  it('handles template with subdirectories only (no files)', () => {
    const srcDir = join(tmpDir, 'subdirs-only')
    mkdirSync(join(srcDir, 'a', 'b'), { recursive: true })

    const destDir = join(tmpDir, 'subdirs-dest')
    copyAndSubstitute(srcDir, destDir, { name: 'test' })

    expect(existsSync(join(destDir, 'a', 'b'))).toBe(true)
  })

  it('does not error when vars object is empty', () => {
    const srcDir = join(tmpDir, 'no-vars')
    createTemplate(srcDir, { 'file.txt': 'static content' })

    const destDir = join(tmpDir, 'no-vars-dest')
    expect(() => copyAndSubstitute(srcDir, destDir, {})).not.toThrow()
    expect(readFileSync(join(destDir, 'file.txt'), 'utf-8')).toBe('static content')
  })
})

// ---------------------------------------------------------------------------
// Integration: scaffolding end-to-end with real templates
// ---------------------------------------------------------------------------

describe('scaffolding Vue template (integration)', () => {
  it('produces the expected file structure', () => {
    const vueTemplate = join(TEMPLATES_DIR, 'vue')
    expect(existsSync(vueTemplate)).toBe(true)
    expect(statSync(vueTemplate).isDirectory()).toBe(true)

    const destDir = join(tmpDir, 'scaffolded-vue')
    copyAndSubstitute(vueTemplate, destDir, { name: 'my-vue-app' })

    const files = collectFiles(destDir)
    expect(files).toHaveProperty('package.json')
    expect(files).toHaveProperty('vite.config.js')
    expect(files).toHaveProperty('src/app.html')
    expect(files).toHaveProperty('src/pages/index.vue')
    expect(files).toHaveProperty('src/pages/about.vue')
    expect(files).toHaveProperty('src/pages/_error.vue')
  })

  it('substitutes {{name}} only in package.json, not in .vue files', () => {
    const destDir = join(tmpDir, 'scaffolded-vue')
    copyAndSubstitute(join(TEMPLATES_DIR, 'vue'), destDir, { name: 'my-vue-app' })

    const pkg = readFileSync(join(destDir, 'package.json'), 'utf-8')
    expect(pkg).toContain('"my-vue-app"')
    expect(pkg).not.toContain('{{name}}')

    const index = readFileSync(join(destDir, 'src/pages/index.vue'), 'utf-8')
    expect(index).toContain('{{ message }}')
    expect(index).not.toContain('{{name}}')
  })

  it('sets correct scripts in package.json', () => {
    const destDir = join(tmpDir, 'scaffolded-vue')
    copyAndSubstitute(join(TEMPLATES_DIR, 'vue'), destDir, { name: 'test' })

    const pkg = JSON.parse(readFileSync(join(destDir, 'package.json'), 'utf-8'))
    expect(pkg.scripts.dev).toBe('vitella dev')
    expect(pkg.scripts.build).toBe('vitella build')
    expect(pkg.scripts.start).toBe('vitella start')
  })

  it('sets correct dependencies for Vue template', () => {
    const destDir = join(tmpDir, 'scaffolded-vue')
    copyAndSubstitute(join(TEMPLATES_DIR, 'vue'), destDir, { name: 'test' })

    const pkg = JSON.parse(readFileSync(join(destDir, 'package.json'), 'utf-8'))
    expect(pkg.dependencies['@vitella-ssr/core']).toBe('^0.1.0')
    expect(pkg.dependencies['@vitella-ssr/vue']).toBe('^0.1.0')
    expect(pkg.dependencies.vue).toBe('^3.5.0')
    expect(pkg.devDependencies['@vitejs/plugin-vue']).toBe('^6.0.0')
    expect(pkg.devDependencies.vite).toBe('^8.0.0')
  })

  it('vite.config.js imports vue adapter', () => {
    const destDir = join(tmpDir, 'scaffolded-vue')
    copyAndSubstitute(join(TEMPLATES_DIR, 'vue'), destDir, { name: 'test' })

    const config = readFileSync(join(destDir, 'vite.config.js'), 'utf-8')
    expect(config).toContain("import { vueAdapter } from '@vitella-ssr/vue'")
    expect(config).toContain('adapter: vueAdapter')
  })

  it('app.html contains all vitella placeholders', () => {
    const destDir = join(tmpDir, 'scaffolded-vue')
    copyAndSubstitute(join(TEMPLATES_DIR, 'vue'), destDir, { name: 'test' })

    const html = readFileSync(join(destDir, 'src/app.html'), 'utf-8')
    expect(html).toContain('<!--vitella-title-->')
    expect(html).toContain('<!--vitella-head-->')
    expect(html).toContain('<!--vitella-html-->')
    expect(html).toContain('<!--vitella-state-->')
    expect(html).toContain('<!--vitella-scripts-->')
  })

  it('error page has correct props', () => {
    const destDir = join(tmpDir, 'scaffolded-vue')
    copyAndSubstitute(join(TEMPLATES_DIR, 'vue'), destDir, { name: 'test' })

    const errorPage = readFileSync(join(destDir, 'src/pages/_error.vue'), 'utf-8')
    expect(errorPage).toContain("defineProps(['statusCode', 'statusMessage', 'url'])")
    expect(errorPage).toContain('Go Home')
  })

  it('about page has correct links', () => {
    const destDir = join(tmpDir, 'scaffolded-vue')
    copyAndSubstitute(join(TEMPLATES_DIR, 'vue'), destDir, { name: 'test' })

    const about = readFileSync(join(destDir, 'src/pages/about.vue'), 'utf-8')
    expect(about).toContain('<h1>About</h1>')
    expect(about).toContain('<a href="/">Home</a>')
  })
})

describe('scaffolding Vanilla template (integration)', () => {
  it('produces the expected file structure', () => {
    const vanillaTemplate = join(TEMPLATES_DIR, 'vanilla')
    expect(existsSync(vanillaTemplate)).toBe(true)
    expect(statSync(vanillaTemplate).isDirectory()).toBe(true)

    const destDir = join(tmpDir, 'scaffolded-vanilla')
    copyAndSubstitute(vanillaTemplate, destDir, { name: 'my-vanilla-app' })

    const files = collectFiles(destDir)
    expect(files).toHaveProperty('package.json')
    expect(files).toHaveProperty('vite.config.js')
    expect(files).toHaveProperty('src/app.html')
    expect(files).toHaveProperty('src/pages/index.js')
    expect(files).toHaveProperty('src/pages/about.js')
    expect(files).toHaveProperty('src/pages/_error.js')
  })

  it('has correct scripts and deps in package.json', () => {
    const destDir = join(tmpDir, 'scaffolded-vanilla')
    copyAndSubstitute(join(TEMPLATES_DIR, 'vanilla'), destDir, { name: 'test' })

    const pkg = JSON.parse(readFileSync(join(destDir, 'package.json'), 'utf-8'))
    expect(pkg.scripts.dev).toBe('vitella dev')
    expect(pkg.dependencies).toHaveProperty('@vitella-ssr/core')
    expect(pkg.devDependencies).toHaveProperty('vite')
    expect(pkg.dependencies).not.toHaveProperty('vue')
  })

  it('vite.config.js has inline vanilla adapter', () => {
    const destDir = join(tmpDir, 'scaffolded-vanilla')
    copyAndSubstitute(join(TEMPLATES_DIR, 'vanilla'), destDir, { name: 'test' })

    const config = readFileSync(join(destDir, 'vite.config.js'), 'utf-8')
    expect(config).toContain("name: 'vanilla'")
    expect(config).toContain("extensions: ['.js']")
    expect(config).toContain('component(loadData)')
  })

  it('vanilla index.js exports both default function and load', () => {
    const destDir = join(tmpDir, 'scaffolded-vanilla')
    copyAndSubstitute(join(TEMPLATES_DIR, 'vanilla'), destDir, { name: 'test' })

    const index = readFileSync(join(destDir, 'src/pages/index.js'), 'utf-8')
    expect(index).toContain('export default function Home')
    expect(index).toContain('export const load = async')
    expect(index).toContain('Welcome to your new Vitella SSR site.')
  })
})

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

describe('main', () => {
  const noopInstall = () => {}

  it('scaffolds a Vue project with default values', async () => {
    const dest = join(tmpDir, 'scaffolded-vue-main')
    const mockPrompt = async (q, d) => {
      if (q.includes('Project name:')) return 'scaffolded-vue-main'
      if (q.includes('Framework')) return 'vue'
      return d
    }

    await main({
      prompt: mockPrompt,
      argv: [null, null, 'scaffolded-vue-main'],
      cwd: tmpDir,
      runInstall: noopInstall,
    })

    expect(existsSync(join(dest, 'package.json'))).toBe(true)
    expect(existsSync(join(dest, 'src/pages/index.vue'))).toBe(true)
    expect(existsSync(join(dest, 'node_modules'))).toBe(false)
  })

  it('scaffolds a Vanilla project with custom name', async () => {
    const dest = join(tmpDir, 'custom-name-main')
    const mockPrompt = async (q, d) => {
      if (q.includes('Project name:')) return 'custom-name-main'
      if (q.includes('Framework')) return 'vanilla'
      return d
    }

    await main({
      prompt: mockPrompt,
      argv: [null, null, 'custom-name-main'],
      cwd: tmpDir,
      runInstall: noopInstall,
    })

    const pkg = JSON.parse(readFileSync(join(dest, 'package.json'), 'utf-8'))
    expect(pkg.name).toBe('custom-name-main')
    expect(existsSync(join(dest, 'src/pages/index.js'))).toBe(true)
  })

  it('uses argv[2] as default project name when not overridden by prompt', async () => {
    const dest = join(tmpDir, 'argv-default-name')
    const mockPrompt = async (q, d) => {
      if (q.includes('Framework')) return 'vue'
      return d
    }

    await main({
      prompt: mockPrompt,
      argv: [null, null, 'argv-default-name'],
      cwd: tmpDir,
      runInstall: noopInstall,
    })

    const pkg = JSON.parse(readFileSync(join(dest, 'package.json'), 'utf-8'))
    expect(pkg.name).toBe('argv-default-name')
  })

  it('throws for invalid project name', async () => {
    const mockPrompt = async (q, d) => {
      if (q.includes('Project name:')) return 'invalid name!'
      if (q.includes('Framework')) return 'vue'
      return d
    }

    await expect(main({
      prompt: mockPrompt,
      argv: [null, null, 'ignored'],
      cwd: tmpDir,
      runInstall: noopInstall,
    })).rejects.toThrow(/Invalid project name/)
  })

  it('throws for unknown framework', async () => {
    const mockPrompt = async (q, d) => {
      if (q.includes('Project name:')) return 'my-app'
      if (q.includes('Framework')) return 'angular'
      return d
    }

    await expect(main({
      prompt: mockPrompt,
      argv: [null, null, 'my-app'],
      cwd: tmpDir,
      runInstall: noopInstall,
    })).rejects.toThrow(/Unknown framework/)
  })

  it('throws if target directory already exists', async () => {
    const projectName = 'existing-dir'
    mkdirSync(join(tmpDir, projectName), { recursive: true })

    const mockPrompt = async (q, d) => {
      if (q.includes('Project name:')) return projectName
      if (q.includes('Framework')) return 'vue'
      return d
    }

    await expect(main({
      prompt: mockPrompt,
      argv: [null, null, projectName],
      cwd: tmpDir,
      runInstall: noopInstall,
    })).rejects.toThrow(/already exists/)
  })
})
