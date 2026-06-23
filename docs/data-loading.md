# Data Loading

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

## Load Context

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

## Cookies

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
