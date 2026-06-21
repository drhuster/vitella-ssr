# Creating Adapters for Vitella SSR

Vitella Core is framework-agnostic — it handles routing, middleware, the HTML shell, and server management. **Adapters** bridge the gap between Vitella Core and your chosen UI framework (Vue, React, Lit, Svelte, etc.).

This guide explains the adapter contract in detail and walks through creating adapters for React and Lit.

---

## The Adapter Interface

An adapter is any object conforming to the `Adapter` type:

```ts
interface Adapter {
  name: string
  extensions: string[]
  render: (options: {
    page: string
    component: any
    layout?: any
    loadData: Record<string, unknown>
    req: IncomingMessage
    res: ServerResponse
  }) => string | Promise<string | AdapterRenderResult>

  getClientEntry?: (page: string, pagePath: string, layout?: string) => string
}
```

And the result shape:

```ts
interface AdapterRenderResult {
  html: string
  head?: string
  title?: string
}
```

### Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier, e.g. `'react'`, `'lit'` |
| `extensions` | Yes | File extensions this adapter handles, e.g. `['.jsx', '.tsx']` or `['.lit.js']` |
| `render` | Yes | Server-side rendering function — receives a page component and returns HTML |
| `getClientEntry` | No | Generates JavaScript source for client hydration. If omitted, no client-side script is injected |

---

## The `render()` Method — Deep Dive

The `render` method is the heart of an adapter. Vitella Core calls it with:

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | `string` | File path of the page component (for reference/diagnostics) |
| `component` | `any` | The default export of the page module — whatever the framework's component type is |
| `layout` | `any` | Optional — the default export of the nearest `_layout` file |
| `loadData` | `Record<string, unknown>` | Data returned by `load()` functions on the page and layout, merged into one object |
| `req` | `IncomingMessage` | Raw Node.js HTTP request (headers, URL, method, etc.) |
| `res` | `ServerResponse` | Raw Node.js HTTP response (for streaming or direct writes) |

### Return Value

Return **either**:

- A plain HTML string (the rendered component body, without `<html>` / `<body>` wrappers)
- An `AdapterRenderResult` object for richer metadata:

```ts
{
  html: string       // Required — rendered HTML to inject into <!--vitella-html-->
  head?: string      // Optional — <meta>, <link>, <style> tags for <!--vitella-head-->
  title?: string     // Optional — page title for <!--vitella-title-->
}
```

The `head` string is injected verbatim into the `<head>` element. Build it from your framework's head management API or from component metadata.

### What Happens After `render()` Returns

Vitella Core takes the result and:

1. Places `html` into `<!--vitella-html-->` in the shell template
2. Places `title` into `<!--vitella-title-->`
3. Places `head` into `<!--vitella-head-->`
4. Serializes `loadData` as JSON into `<!--vitella-state-->` as `window.__INITIAL_STATE__`
5. If `getClientEntry` is defined, injects the returned script into `<!--vitella-scripts-->`

---

## The `getClientEntry()` Method

This optional method generates client-side JavaScript that:

1. Imports the page component (and optional layout)
2. Mounts / hydrates the rendered HTML on the client
3. Reads `window.__INITIAL_STATE__` and passes it as props
4. Sets up any framework-specific client plumbing

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | `string` | The page component's module specifier (e.g. `'./src/pages/index.jsx'`) |
| `pagePath` | `string` | The file path (for generating import paths) |
| `layout` | `string` | Optional — the layout module specifier |

### Return Value

A string of JavaScript source code. Vitella Core writes this to a virtual module that gets loaded as the page's entry point.

---

## The Rendering Lifecycle

Here's the complete flow when a page request arrives:

```
Request URL
  ↓
Core matches route (path → filesystem route)
  ↓
Core SSR-loads the page module (dynamic import via Vite)
  ↓
Core SSR-loads the nearest _layout module (if any)
  ↓
Core calls page.load() and layout.load() (if they exist)
  ↓
Core merges returned data into loadData (layout first, then page — page wins conflicts)
  ↓
Core calls adapter.render({ component, layout, loadData, req, res })
  ↓
Adapter renders component to HTML (with optional head/title metadata)
  ↓
Core serializes loadData → window.__INITIAL_STATE__
  ↓
Core calls adapter.getClientEntry(page, pagePath, layout) if defined
  ↓
Core injects everything into HTML shell placeholders
  ↓
Core sends the full HTML response
```

---

## Data Loading and State Hydration

Pages can export a `load` function that fetches data before rendering:

```js
export const load = async ({ params, query, cookies, req }) => {
  const res = await fetch(`https://api.example.com/data/${params.slug}`)
  const data = await res.json()
  return { items: data }
}
```

The data returned by `load()` is available in `render()` as `loadData`, and Vitella Core automatically serializes it into the page as:

```html
<script>window.__INITIAL_STATE__ = { items: [...] }</script>
```

Your `getClientEntry()` code should read `window.__INITIAL_STATE__` and pass the data as component props during hydration.

---

## Package Structure for a New Adapter

A well-structured adapter package follows the same pattern as `@vitella-ssr/vue`:

```
@vitella-ssr/<framework>/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # Exports the adapter and any public utilities
│   ├── renderer.ts       # Implementation of render()
│   ├── client-entry.ts   # Implementation of getClientEntry()
│   └── <framework>-specific files
└── README.md
```

### `package.json` Conventions

```json
{
  "name": "@vitella-ssr/<framework>",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "peerDependencies": {
    "@vitella-ssr/core": "^0.1.0",
    "<framework>": "^<version>"
  }
}
```

Adapters should declare `@vitella-ssr/core` as a **peer dependency** so the user has a single shared core instance.

---

## Step-by-Step: Creating a React Adapter

### 1. Install dependencies

```bash
npm install react react-dom @types/react @types/react-dom
npm install --save-dev @vitejs/plugin-react
```

### 2. Implement the renderer

```ts
// src/renderer.ts
import React from 'react'
import { renderToString } from 'react-dom/server'
import type { Adapter, AdapterRenderResult } from '@vitella-ssr/core'

export async function renderReactComponent(
  component: any,
  loadData: Record<string, unknown>,
  layout?: any
): Promise<string | AdapterRenderResult> {
  let element: React.ReactElement

  if (layout) {
    const Layout = layout.default || layout
    const Page = component.default || component
    element = React.createElement(Layout, loadData,
      React.createElement(Page, loadData)
    )
  } else {
    const Page = component.default || component
    element = React.createElement(Page, loadData)
  }

  const html = renderToString(element)

  return { html }
}
```

### 3. Implement client entry

```ts
// src/client-entry.ts
export function generateReactClientEntry(
  page: string,
  pagePath: string,
  layout?: string
): string {
  const layoutImport = layout
    ? `import Layout from '${layout}'`
    : ''

  const layoutWrap = layout
    ? `React.createElement(Layout, __INITIAL_STATE__, React.createElement(Page, __INITIAL_STATE__))`
    : `React.createElement(Page, __INITIAL_STATE__)`

  return `
import React from 'react'
import { hydrateRoot } from 'react-dom/client'
import Page from '${page}'
${layoutImport}

const __INITIAL_STATE__ = window.__INITIAL_STATE__ || {}

hydrateRoot(
  document.getElementById('root'),
  ${layoutWrap}
)
`.trim()
}
```

### 4. Assemble the adapter

```ts
// src/index.ts
import { renderReactComponent } from './renderer.js'
import { generateReactClientEntry } from './client-entry.js'
import type { Adapter } from '@vitella-ssr/core'

export const reactAdapter: Adapter = {
  name: 'react',
  extensions: ['.jsx', '.tsx'],
  render: async ({ component, loadData, layout }) => {
    return renderReactComponent(component, loadData, layout)
  },
  getClientEntry(page, pagePath, layout?) {
    return generateReactClientEntry(page, pagePath, layout)
  },
}
```

### 5. Usage

```js
// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { vitellaPlugin } from '@vitella-ssr/core'
import { reactAdapter } from '@vitella-ssr/react'

export default defineConfig({
  plugins: [
    react(),
    vitellaPlugin({ adapter: reactAdapter }),
  ],
})
```

---

## Step-by-Step: Creating a Lit Adapter

Lit uses a different SSR model — instead of `renderToString`, Lit components render into a `RenderResult` via `@lit-labs/ssr`.

### 1. Install dependencies

```bash
npm install lit @lit-labs/ssr @lit-labs/ssr-client
```

### 2. Implement the renderer

```ts
// src/renderer.ts
import { render } from '@lit-labs/ssr'
import { collectResult } from '@lit-labs/ssr/lib/collect-result.js'
import { html } from 'lit'
import type { Adapter, AdapterRenderResult } from '@vitella-ssr/core'

export async function renderLitComponent(
  component: any,
  loadData: Record<string, unknown>,
  layout?: any
): Promise<string | AdapterRenderResult> {
  const PageTag = component.default || component
  const LayoutTag = layout?.default || layout
  const dataAttr = `data-props='${JSON.stringify(loadData).replace(/'/g, "&#39;")}'`

  let template

  if (LayoutTag) {
    template = html`
      <${LayoutTag} .data=${loadData}>
        <${PageTag} .data=${loadData} ${dataAttr}></${PageTag}>
      </${LayoutTag}>
    `
  } else {
    template = html`
      <${PageTag} .data=${loadData} ${dataAttr}></${PageTag}>
    `
  }

  const renderResult = render(template)
  const html = await collectResult(renderResult)

  return { html }
}
```

### 3. Implement client entry

Lit components are self-hydrating via their custom element definitions — you mainly need to ensure declarative shadow DOM is handled:

```ts
// src/client-entry.ts
export function generateLitClientEntry(
  page: string,
  pagePath: string,
  layout?: string
): string {
  const layoutImport = layout ? `import '${layout}'` : ''

  return `
import '${page}'
${layoutImport}

// Lit components hydrate automatically via custom element registration.
// If the SSR output uses declarative shadow DOM, attach them:
for (const template of document.querySelectorAll('template[shadowroot]')) {
  const mode = template.getAttribute('shadowroot')
  const shadowRoot = template.parentElement.attachShadow({ mode })
  shadowRoot.appendChild(template.content)
  template.remove()
}
`.trim()
}
```

### 4. Assemble the adapter

```ts
// src/index.ts
import { renderLitComponent } from './renderer.js'
import { generateLitClientEntry } from './client-entry.js'
import type { Adapter } from '@vitella-ssr/core'

export const litAdapter: Adapter = {
  name: 'lit',
  extensions: ['.js', '.ts'],
  render: async ({ component, loadData, layout }) => {
    return renderLitComponent(component, loadData, layout)
  },
  getClientEntry(page, pagePath, layout?) {
    return generateLitClientEntry(page, pagePath, layout)
  },
}
```

### 5. Usage

```js
// vite.config.js
import { defineConfig } from 'vite'
import { vitellaPlugin } from '@vitella-ssr/core'
import { litAdapter } from '@vitella-ssr/lit'

export default defineConfig({
  plugins: [
    vitellaPlugin({ adapter: litAdapter }),
  ],
})
```

---

## Layout Support

Vitella supports hierarchical layouts via `_layout` files. Adapters must handle the wrapping:

```ts
render: async ({ component, layout, loadData }) => {
  if (layout) {
    // Wrap the page component in the layout component
    return renderWithLayout(component, layout, loadData)
  }
  return renderComponent(component, loadData)
}
```

The layout receives the same `loadData` as the page. The page component is rendered as the layout's child (typically via a `<slot>` in Lit or `children` in React).

---

## Head Management

If your framework provides a head/metadata API (like Vue's `useHead`), the adapter should extract it from the SSR context and return it in `AdapterRenderResult.head` and `AdapterRenderResult.title`.

For frameworks without a built-in head API, page components can export static metadata that the adapter reads:

```ts
render: async ({ component, loadData }) => {
  const Page = component.default || component
  const title = Page.title || loadData.title || 'Default Title'
  const head = Page.meta?.map(m => `<meta ${m} />`).join('') || ''
  const html = renderToString(React.createElement(Page, loadData))
  return { html, head, title }
}
```

---

## State Management Integration

For state management libraries (like Pinia, Zustand, Redux), you can create a combined adapter that extends the base framework adapter:

```ts
import { frameworkAdapter } from '@vitella-ssr/<framework>'

export const stateAdapter: Adapter = {
  ...frameworkAdapter,
  name: `<framework>-state`,
  render: async (options) => {
    // 1. Create a fresh store instance per request
    // 2. Perform initial render to populate store state
    // 3. Serialize store state into loadData
    // 4. Return render result with serialized state
    return frameworkAdapter.render(options)
  },
  getClientEntry: (page, pagePath, layout) => {
    // Generate client entry that rehydrates store state
    return frameworkAdapter.getClientEntry!(page, pagePath, layout)
  },
}
```

---

## Testing Your Adapter

Create a test suite that verifies:

1. **`render()` returns valid HTML or `AdapterRenderResult`** — test with a minimal component
2. **`render()` passes `loadData` as props** — render a component that displays the data, verify output
3. **`render()` wraps in layout** — test with a layout that includes the page
4. **`getClientEntry()` generates valid JavaScript** — test the output string parses correctly
5. **Round-trip SSR → hydration** — render on server, mount on a simulated DOM, verify interactivity

```ts
import { describe, it, expect } from 'vitest'
import { myAdapter } from '../src/index.js'

describe('myAdapter', () => {
  it('renders a component to HTML', async () => {
    const result = await myAdapter.render({
      page: '/src/pages/index.jsx',
      component: { default: MyComponent },
      loadData: { message: 'Hello' },
      req: {} as any,
      res: {} as any,
    })
    expect(result).toHaveProperty('html')
    if (typeof result !== 'string') {
      expect(result.html).toContain('Hello')
    }
  })

  it('generates a valid client entry', () => {
    const code = myAdapter.getClientEntry!('./Page', 'src/pages/index.jsx')
    expect(code).toContain('hydrateRoot')
    expect(() => new Function(code)).not.toThrow()
  })
})
```

---

## Summary of Requirements

| Requirement | Why |
|-------------|-----|
| Implement `Adapter` interface | Core calls `render()` to produce HTML and `getClientEntry()` for hydration |
| Register file extensions | Core uses `extensions` to identify which files belong to this adapter |
| Handle layouts | Core passes `layout` when a `_layout` file exists |
| Consume `loadData` | Core expects the adapter to pass this data to the component as props |
| Return `AdapterRenderResult` | Enables head/title injection into the HTML shell |
| Serialize state for hydration | Core provides `window.__INITIAL_STATE__`; the client entry must read it |
| Declare core as peer dependency | Ensures a single shared core instance |
