<template>
  <main>
    <h1>Vitella SSR</h1>
    <p>A minimal, framework-agnostic SSR framework built on Vite.</p>
    <section>
      <h2>Pinia Counter (shared across pages)</h2>
      <p>Count: {{ counter.count }}</p>
      <button @click="counter.increment">+1</button>
      <p>Visit <a href="/dashboard">Dashboard</a> — the count persists via localStorage.</p>
    </section>
  </main>
</template>

<script setup>
import { useHead } from '@vitella-ssr/vue'
import { useCounterStore } from '../stores/counter'

useHead({
  title: 'Vitella SSR — Home',
  meta: [{ name: 'description', content: 'A minimal SSR framework built on Vite' }],
})

const counter = useCounterStore()
</script>
