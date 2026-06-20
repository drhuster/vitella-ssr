# Vitella SSR documentation

A minimal, framework-agnostic server-side rendering framework built on Vite and Node built-in packages. Zero runtime dependencies beyond Vite. No Express, no Koa, no client-side router.

## Quick Start

```bash
npm create vitella-ssr@latest my-app
cd my-app
npm install
npm run dev
```

Or use the example app directly:

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
npm install @vitella-ssr/vue vue @vue/server-renderer
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

## Routing

### Page Routes (`src/pages/`)

Files become URL paths automatically:

| File | Route |
|------|-------|
| `src/pages/index.vue` | `/` |
| `src/pages/about.vue` | `/about` |
| `src/pages/blog/index.vue` | `/blog` |
| `src/pages/blog/[slug].vue` | `/blog/:slug` |
| `src/pages/blog/[year]/[slug].vue` | `/blog/:year/:slug` |
| `src/pages/_layout.vue` | _(shared layout, no route)_ |
| `src/pages/_error.vue` | _(error page, no route)_ |

Pages are server-rendered to full HTML with client hydration. `_layout.vue` and `_error.vue` are special files — they are not registered as routes.

### API Routes (`src/server/`)

Files under `src/server/` become JSON API endpoints, auto-prefixed with `/api`:

| File | Route |
|------|-------|
| `src/server/hello.js` | `GET /api/hello` |
| `src/server/users.js` | `GET|POST /api/users` |
| `src/server/users/[id].js` | `GET|PUT|DELETE /api/users/:id` |

Export named handlers for each HTTP method. The third argument is a request context with `params`, `query`, and `cookies`:

```js
// src/server/users.js
export const get = async (req, res, ctx) => {
  return { status: 200, body: [{ id: 1, name: 'Alice' }] }
}

export const post = async (req, res, ctx) => {
  let body = ''
  for await (const chunk of req) body += chunk
  const data = JSON.parse(body)
  ctx.cookies.set('last_added', '2', { httpOnly: true })
  return { status: 201, body: { id: 2, name: data.name } }
}
```

### Error Pages

When a request doesn't match any route, or when a page's `load` function throws, Vitella renders an error page with the appropriate HTTP status code.

**Default behavior:** A built-in error page is used automatically — no setup required.

**Custom error page:** Create `src/pages/_error.{ext}` (same extension as your pages) to override the default:

```vue
<!-- src/pages/_error.vue -->
<script>
export const load = async ({ req, params, query, cookies }) => {
  // Custom error logic (logging, etc.)
  return {}
}
</script>

<template>
  <main class="error-page">
    <h1>{{ statusCode }}</h1>
    <p>{{ statusMessage }}</p>
    <p>{{ url }}</p>
  </main>
</template>

<script setup>
defineProps(['statusCode', 'statusMessage', 'url'])
</script>
```

**Error page props:**

| Prop | Type | Description |
|------|------|-------------|
| `statusCode` | `number` | HTTP status code (e.g. `404`, `500`) |
| `statusMessage` | `string` | HTTP status text (e.g. `"Not Found"`, `"Internal Server Error"`) |
| `url` | `string` | The URL that triggered the error |

**Layout support:** Error pages are wrapped in the nearest `_layout` file, just like regular pages. If you have a site-wide layout, your error page inherits the header/footer automatically.

**Error conditions:**

| Condition | Status Code |
|-----------|-------------|
| No route matches the URL | `404` |
| Page `load()` throws or returns an error | `500` |
| SSR render throws | `500` |
| Request body exceeds 10MB | `413` (bypasses error page) |

## Data Loading

Pages can export a `load` function that runs before render on every request:

```vue
<script>
export const load = async ({ params, query, cookies }) => {
  const res = await fetch(`https://api.example.com/posts/${params.slug}`)
  return { post: await res.json() }
}
</script>

<template>
  <article>
    <h1>{{ post.title }}</h1>
    <p>{{ post.body }}</p>
  </article>
</template>

<script setup>
defineProps(['post'])
</script>
```

Load data is serialized into `window.__INITIAL_STATE__` for client hydration.

### Load Context

The `load` function receives:
- `req` — The raw Node `IncomingMessage` (for headers, IP, etc.)
- `params` — Dynamic route parameters (e.g., `{ slug: 'hello-world' }`)
- `query` — URL query string parsed as an object (e.g., `{ page: '2' }`)
- `cookies` — A `Cookies` object for reading and setting cookies

```vue
<script>
export const load = async ({ req, params, query, cookies }) => {
  // Read a cookie sent by the client
  const session = cookies.get('session')

  // Set a cookie on the response
  cookies.set('visited', '1', { httpOnly: true, maxAge: 3600 })

  const res = await fetch(`https://api.example.com/posts/${params.slug}`)
  return { post: await res.json() }
}
</script>
```

### Cookies

Both `load` functions and API handlers receive a `cookies` object with read and write methods:

```js
// Read
cookies.get('session')           // -> string | undefined
cookies.getAll()                  // -> Record<string, string>

// Write (buffered, sent on response)
cookies.set('name', 'value', {
  maxAge?: number                 // seconds
  expires?: Date
  path?: string                   // default '/'
  domain?: string
  secure?: boolean
  httpOnly?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
})
```

`cookies.set()` buffers the `Set-Cookie` header; the server flushes it before sending the response. Calling `set()` multiple times for the same name keeps the last value; calling it for different names produces multiple `Set-Cookie` headers.

## Middleware

Define global middleware in `vite.config.js` via `vitellaPlugin()`:

```js
import { vitellaPlugin } from '@vitella-ssr/core'

export default defineConfig({
  plugins: [vitellaPlugin({
    middleware: [
      async (req, res, next) => {
        req.user = await authenticate(req)
        next()
      },
      async (req, res, next) => {
        console.log(`${req.method} ${req.url}`)
        next()
      }
    ]
  })],
})
```

Middleware runs in order before route matching. Call `next()` to continue the chain; omit it to short-circuit (e.g., for auth redirects).

## CLI

| Command | Description |
|---------|-------------|
| `vitella dev` | Start Vite dev server with HMR |
| `vitella build` | Build client + server bundles |
| `vitella start` | Production server (Node `http`, port from `PORT` env, default `3000`) |

In production, the server uses Node's built-in `http` module — no Vite dependency at runtime.

## Adapters

Vitella is framework-agnostic. The core handles routing, middleware, and the HTML shell. Adapters handle component rendering.

### Vue Adapter (`@vitella-ssr/vue`)

```js
import { vueAdapter } from '@vitella-ssr/vue'

// In vite.config.js, pass to vitellaPlugin()
vitellaPlugin({ adapter: vueAdapter })
```

Uses `vue` and `@vue/server-renderer` — no Vue Router, no auto-imports.

### Pinia Adapter (`@vitella-ssr/pinia`)

```js
import { createPiniaSSR } from '@vitella-ssr/pinia'
import { hydratePinia } from '@vitella-ssr/pinia/client'
```

Provides `createPiniaSSR()` for server-side store creation with state serialization, and `hydratePinia()` for client-side state hydration from `window.__INITIAL_STATE__.pinia`.

### Writing a Custom Adapter

```ts
import type { Adapter } from '@vitella-ssr/core'

export const myAdapter: Adapter = {
  name: 'my-framework',
  extensions: ['.jsx'],
  render: async ({ page, loadData, req, res }) => {
    // Render the page component to an HTML string
    return '<html>...</html>'
  },
}
```

## Configuration

All configuration is passed to `vitellaPlugin()` in `vite.config.js`:

```js
vitellaPlugin({
  // HTML shell template path (relative to project root)
  appShell: 'src/app.html',

  // Global middleware functions
  middleware: [],

  // Framework adapter (e.g., vueAdapter)
  adapter: undefined,

  // Custom directory paths
  pagesDir: 'src/pages',
  serverDir: 'src/server',
})
```

## HTML Shell Placeholders

| Placeholder | Description |
|-------------|-------------|
| `<!--vitella-title-->` | Page title |
| `<!--vitella-head-->` | Head elements (meta, links) |
| `<!--vitella-html-->` | Rendered page HTML (required) |
| `<!--vitella-state-->` | Serialized `__INITIAL_STATE__` for hydration |
| `<!--vitella-scripts-->` | Client-side script tags |

## Packages

| Package | Description |
|---------|-------------|
| `@vitella-ssr/core` | Vite plugin, routing, middleware, server, CLI |
| `@vitella-ssr/vue` | Vue 3 SSR adapter |
| `@vitella-ssr/pinia` | Pinia store SSR support |
| `create-vitella-ssr` | Project scaffolding CLI |

## Architecture

```
Dev mode:
  Request → Vite Dev Server
           → Route match?
             → Yes: page or API handler
             → No: error page (404)
           → load() throws?
             → Yes: error page (500)
           → Adapter renders component / error page
           → Core injects into HTML shell
           → Response

Production:
  vite build → route manifest JSON
  vitella start → Node http.createServer
                → Match route in manifest
                → Load pre-built server chunk
                → Adapter renders / API handler executes
                → Error? Render error page
                → Response
```

No client-side router. Navigation uses full page loads. Hydration makes pages interactive.
