# @vitella-ssr/vue

Vue adapter for Vitella. Renders Vue components to HTML during SSR and generates client hydration code. Includes the `useHead` composable for injecting `<title>`, `<meta>`, and `<link>` tags from within components.

```ts
// vitella.config.ts
import { vitellaPlugin } from '@vitella-ssr/core'
import { vueAdapter } from '@vitella-ssr/vue'

export default {
  plugins: [vitellaPlugin({
    appShell: 'src/app.html',
    adapter: vueAdapter,
  })],
}
```

```vue
<!-- src/pages/index.vue -->
<script setup>
import { useHead } from '@vitella-ssr/vue'

useHead({
  title: 'Home',
  meta: [{ name: 'description', content: 'Welcome' }],
})
</script>

<template>
  <h1>Hello SSR</h1>
</template>
```
