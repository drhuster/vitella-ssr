<script>
export const load = async () => {
  return {
    cachedAt: new Date().toISOString(),
    ttl: 3600,  // Cache this page for 1 hour
  }
}
</script>

<template>
  <main>
    <h1>Cached Page (TTL: 1 hour)</h1>
    <p>This page sets <code>Cache-Control: public, max-age=3600</code> via its <code>load()</code> function.</p>
    <p>The <code>ttl</code> field is extracted from <code>load()</code> and used to set the response cache header. It's stripped before being passed to the component as a prop.</p>
    <p>Cached at: {{ cachedAt }}</p>
    <p>Refresh the page — for the next hour, the browser may serve from cache (depending on cache status).</p>
    <p>Assets in <code>/assets/</code> (such as <code>/assets/sample-image.svg</code>) get <code>Cache-Control: public, max-age=86400</code> (1 day) configured globally in <code>vite.config.js</code>.</p>
    <img :src="imageUrl" alt="Sample Image" style="margin-top: 2rem; width: 200px;" />
  </main>
</template>

<script setup>
import { useHead } from '@vitella-ssr/vue'
defineProps(['cachedAt'])

const imageUrl = '/assets/sample-image.svg'

useHead({
  title: 'Cached Page — Vitella SSR',
  meta: [{ name: 'description', content: 'Demonstrates per-page TTL via load()' }],
})
</script>

<style scoped>
main {
  max-width: 700px;
  margin: 2rem auto;
  padding: 0 1rem;
}
h1 {
  font-size: 1.75rem;
  margin-bottom: 1rem;
}
code {
  background: #f5f5f5;
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  font-family: monospace;
}
</style>