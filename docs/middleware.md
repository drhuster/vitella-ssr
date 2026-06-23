# Middleware

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
