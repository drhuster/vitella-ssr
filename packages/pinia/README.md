# @vitella-ssr/pinia

Pinia adapter for Vitella. Extends the Vue adapter with per-request Pinia state creation, automatic serialization of store state into `window.__INITIAL_STATE__`, and client-side hydration.

```ts
// vitella.config.ts
import { vitellaPlugin } from '@vitella-ssr/core'
import { piniaVueAdapter } from '@vitella-ssr/pinia'

export default {
  plugins: [vitellaPlugin({
    appShell: 'src/app.html',
    adapter: piniaVueAdapter,
  })],
}
```

```ts
// src/stores/counter.ts
import { defineStore } from 'pinia'

export const useCounterStore = defineStore('counter', {
  state: () => ({ count: 0 }),
})
```

```vue
<!-- src/pages/index.vue -->
<script setup>
import { useCounterStore } from '../stores/counter'
const counter = useCounterStore()
counter.count++  // persisted and hydrated automatically
</script>
```
