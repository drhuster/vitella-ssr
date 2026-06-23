# Configuration

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
