import { createInterface } from 'readline/promises'
import { existsSync, mkdirSync, cpSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const TEMPLATES_DIR = join(__dirname, '..', 'templates')

export async function prompt(rl, question, defaultValue) {
  return (await rl.question(`${question} `)).trim() || defaultValue
}

export function copyAndSubstitute(srcDir, destDir, vars) {
  cpSync(srcDir, destDir, { recursive: true })

  function substitute(dir) {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        substitute(fullPath)
      } else {
        let content = readFileSync(fullPath, 'utf-8')
        for (const [key, value] of Object.entries(vars)) {
          content = content.replaceAll(`{{${key}}}`, value)
        }
        writeFileSync(fullPath, content)
      }
    }
  }

  substitute(destDir)
}

export function validateProjectName(name) {
  if (!/^[a-z0-9-._]+$/i.test(name)) {
    throw new Error(`Invalid project name "${name}". Use letters, digits, hyphens, dots, or underscores.`)
  }
}

export async function main(opts = {}) {
  const { prompt: promptFn, argv = process.argv, runInstall = execSync, cwd = process.cwd() } = opts

  let rl
  const ask = promptFn || (async (question, defaultValue) => {
    rl = rl || createInterface({ input: process.stdin, output: process.stdout })
    return prompt(rl, question, defaultValue)
  })

  try {
    const defaultName = argv[2] || 'my-vitella-app'
    const projectName = await ask('Project name:', defaultName)
    validateProjectName(projectName)

    const framework = await ask('Framework (vue/vanilla):', 'vue')
    if (framework !== 'vue' && framework !== 'vanilla') {
      throw new Error(`Unknown framework "${framework}". Choose "vue" or "vanilla".`)
    }

    const destDir = join(cwd, projectName)

    if (existsSync(destDir)) {
      throw new Error(`Directory "${destDir}" already exists.`)
    }

    const templateDir = join(TEMPLATES_DIR, framework)
    if (!existsSync(templateDir) || !statSync(templateDir).isDirectory()) {
      throw new Error(`Template "${framework}" not found at ${templateDir}.`)
    }

    mkdirSync(destDir, { recursive: true })
    copyAndSubstitute(templateDir, destDir, { name: projectName })

    runInstall('npm install', { cwd: destDir, stdio: 'inherit' })
  } finally {
    if (rl) rl.close()
  }
}
