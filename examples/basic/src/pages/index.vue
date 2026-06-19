<template>
  <main>
    <h1>Vitella SSR</h1>
    <p>A minimal, framework-agnostic SSR framework built on Vite.</p>
    <nav>
      <a href="/about">About</a>
      <a href="/blog">Blog</a>
      <a href="/dashboard">Dashboard</a>
    </nav>
  </main>
</template>

<script setup>
import { useHead } from '@vitella-ssr/vue'

useHead({
  title: 'Vitella SSR — Home',
  meta: [{ name: 'description', content: 'A minimal SSR framework built on Vite' }],
})
</script>
