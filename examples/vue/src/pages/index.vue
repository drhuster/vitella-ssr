<template>
  <main>
    <h1>Vitella SSR</h1>
    <p>A minimal, framework-agnostic SSR framework built on Vite.</p>
    <counter />
  </main>
</template>

<script setup>
import { useHead } from '@vitella-ssr/vue'
import counter from '../components/counter.vue'

useHead({
  title: 'Vitella SSR — Home',
  meta: [{ name: 'description', content: 'A minimal SSR framework built on Vite' }],
})

</script>
