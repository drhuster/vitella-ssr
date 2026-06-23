import { createInterface } from 'readline/promises'
import { existsSync, mkdirSync, cpSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = join(__dirname, '..', 'templates')

function prompt(rl, question, defaultValue) {
  return rl.question(`${question} `).then(answer => answer.trim() || defaultValue)
}

function copyAndSubstitute(srcDir, destDir, vars) {
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

function validateProjectName(name) {
  if (!/^[a-z0-9-._]+$/i.test(name)) {
    throw new Error(`Invalid project name "${name}". Use letters, digits, hyphens, dots, or underscores.`)
  }
}

export async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  try {
    const projectName = await prompt(rl, 'Project name:', 'my-vitella-app')
    validateProjectName(projectName)

    const framework = await prompt(rl, 'Framework (vue/vanilla):', 'vue')
    if (framework !== 'vue' && framework !== 'vanilla') {
      throw new Error(`Unknown framework "${framework}". Choose "vue" or "vanilla".`)
    }

    const rawTarget = process.argv[2]
    const destDir = rawTarget ? resolve(rawTarget) : join(process.cwd(), projectName)

    if (existsSync(destDir)) {
      throw new Error(`Directory "${destDir}" already exists.`)
    }

    const templateDir = join(TEMPLATES_DIR, framework)
    if (!existsSync(templateDir) || !statSync(templateDir).isDirectory()) {
      throw new Error(`Template "${framework}" not found at ${templateDir}.`)
    }

    mkdirSync(destDir, { recursive: true })
    copyAndSubstitute(templateDir, destDir, { name: projectName })

    console.log(`\nScaffolding project in ${destDir}...`)
    execSync('npm install', { cwd: destDir, stdio: 'inherit' })

    console.log(`\nDone! 🎉\n`)
    console.log(`  cd ${projectName}`)
    console.log(`  npm run dev`)
  } finally {
    rl.close()
  }
}
