# create-vitella-ssr

Scaffold a new [Vitella SSR](https://github.com/anomalyco/vanilla-ssr) project with zero configuration.

```bash
npm create vitella-ssr
```

You'll be prompted for a project name and framework. To skip the name prompt:

```bash
npm create vitella-ssr my-app-name
```

## Interactive Prompts

- **Project name** — defaults to `my-vitella-app` (or the argument if provided)
- **Framework** — `vue` (default) or `vanilla`

After answering, the CLI scaffolds the project and runs `npm install`.

## Templates

### Vue (`vue`)
A Vue 3 project with `@vitella-ssr/vue`, `@vitejs/plugin-vue`, and the standard Vitella file structure (`src/pages/`, `src/app.html`, `vite.config.js`).

### Vanilla (`vanilla`)
A vanilla JS project with `@vitella-ssr/core` and an inline adapter in `vite.config.js`. No framework dependencies.

## Output

```
my-project/
├── package.json
├── vite.config.js
├── src/
│   ├── app.html
│   └── pages/
│       ├── index.vue           (or index.js)
│       ├── about.vue           (or about.js)
│       └── _error.vue          (or _error.js)
```

## Requirements

Node.js >= 20
