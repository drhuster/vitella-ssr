# Routing

## Page Routes (`src/pages/`)

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

## API Routes (`src/server/`)

Files under `src/server/` become JSON API endpoints, auto-prefixed with `/api`:

| File | Route |
|------|-------|
| `src/server/hello.js` | `GET /api/hello` |
| `src/server/users.js` | `GET\|POST /api/users` |
| `src/server/users/[id].js` | `GET\|PUT\|DELETE /api/users/:id` |

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

## Error Pages

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

**Layout support:** Error pages are wrapped in the nearest `_layout` file, just like regular pages.

**Error conditions:**

| Condition | Status Code |
|-----------|-------------|
| No route matches the URL | `404` |
| Page `load()` throws or returns an error | `500` |
| SSR render throws | `500` |
| Request body exceeds 10MB | `413` (bypasses error page) |
