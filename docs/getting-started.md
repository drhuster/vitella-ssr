# Getting Started

A minimal, framework-agnostic server-side rendering framework built on Vite and Node built-in packages. Zero runtime dependencies beyond Vite. No Express, no Koa, no client-side router.

## Quick Start

Scaffold a new project:

```bash
npm create vitella-ssr
cd my-project
npm run dev
```

You'll be prompted for a project name and framework (Vue or vanilla JS).

Or clone the repo and use the example app directly:

```bash
git clone <repo>
cd vitella-ssr/examples/basic
npm install
npm run dev
```

## Project Structure

```
my-app/
├── src/
│   ├── pages/          # Page routes (server-rendered HTML)
│   │   ├── _error.vue  → Error page (404, 500, etc.)
│   │   ├── _layout.vue → Shared layout (wraps sibling/subtree pages)
│   │   ├── index.vue   → GET /
│   │   ├── about.vue   → GET /about
│   │   ├── blog/
│   │   │   ├── index.vue     → GET /blog
│   │   │   └── [slug].vue    → GET /blog/:slug
│   │   └── dashboard.vue     → GET /dashboard
│   ├── server/         # API routes (JSON responses, auto-prefixed /api)
│   │   ├── hello.js    → GET /api/hello
│   │   └── users.js    → GET|POST /api/users
│   └── app.html        # HTML shell template
├── vite.config.js      # Vite configuration (includes Vitella options)
└── package.json
```

## Setup

### 1. Install

```bash
npm install @vitella-ssr/core
```

For Vue:

```bash
npm install @vitella-ssr/vue vue
npm install -D @vitejs/plugin-vue
```

### 2. Configure

`vite.config.js`:

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { vitellaPlugin } from '@vitella-ssr/core'

export default defineConfig({
  plugins: [vue(), vitellaPlugin({
    appShell: 'src/app.html',
  })],
})
```

### 3. Create HTML shell

`src/app.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><!--vitella-title--></title>
  <!--vitella-head-->
</head>
<body>
  <!--vitella-html-->
  <!--vitella-state-->
  <!--vitella-scripts-->
</body>
</html>
```

See [HTML Shell](html-shell.md) for all available placeholders.

### 4. Add scripts to package.json

```json
{
  "scripts": {
    "dev": "vitella dev",
    "build": "vitella build",
    "start": "vitella start"
  }
}
```

## Packages

| Package | Description |
|---------|-------------|
| `@vitella-ssr/core` | Vite plugin, routing, middleware, server, CLI |
| `@vitella-ssr/vue` | Vue 3 SSR adapter |
| `@vitella-ssr/pinia` | Pinia store SSR support |
| `create-vitella-ssr` | Project scaffolding CLI (`npm create vitella-ssr`) |
