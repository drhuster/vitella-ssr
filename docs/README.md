# @vitella-ssr/core

Server-side rendering framework for Vite. Provides the Vite plugin, dev/production servers, routing for pages and API routes, middleware chain, HTML shell rendering, and cookie management.

```ts
// vitella.config.ts
import { vitellaPlugin } from '@vitella-ssr/core'

export default {
  plugins: [vitellaPlugin({
    appShell: 'src/app.html',
    adapter: myAdapter,          // e.g. vueAdapter from @vitella-ssr/vue
  })],
}
```

Pages go in `src/pages/` and API routes in `src/server/`. The CLI (`vitella dev`, `vitella build`, `vitella start`) handles the rest.
