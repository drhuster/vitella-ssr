# Adapters

Vitella is framework-agnostic. The core handles routing, middleware, and the HTML shell. Adapters handle component rendering.

## Vue Adapter (`@vitella-ssr/vue`)

```js
import { vueAdapter } from '@vitella-ssr/vue'

// In vite.config.js, pass to vitellaPlugin()
vitellaPlugin({ adapter: vueAdapter })
```

Uses `vue` and `vue/server-renderer` — no Vue Router, no auto-imports.

## Pinia Adapter (`@vitella-ssr/pinia`)

```js
import { createPiniaSSR } from '@vitella-ssr/pinia'
import { hydratePinia } from '@vitella-ssr/pinia/client'
```

Provides `createPiniaSSR()` for server-side store creation with state serialization, and `hydratePinia()` for client-side state hydration from `window.__INITIAL_STATE__.pinia`.

## Writing a Custom Adapter

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

See [Creating Adapters](creating-adapters.md) for a detailed walkthrough with React and Lit examples.
