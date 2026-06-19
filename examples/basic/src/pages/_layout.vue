<script setup>
import { useHead } from '@vitella-ssr/vue'

useHead({
  link: [{ rel: 'stylesheet', href: '/assets/main.css' }],
})
</script>

<template>
  <div class="page-layout">
    <header class="site-header">
      <nav>
        <a href="/">Home</a>
        <a href="/about">About</a>
        <a href="/blog">Blog</a>
        <a href="/dashboard">Dashboard</a>
        <a href="/cached">Cached</a>
      </nav>
    </header>
    <main>
      <slot />
    </main>
    <footer class="site-footer">
      <p>Vitella SSR — powered by Vite</p>
    </footer>
  </div>
</template>

<style>
.page-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.site-header nav {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: #f5f5f5;
  border-bottom: 1px solid #ddd;
}

.site-footer {
  margin-top: auto;
  padding: 1rem;
  text-align: center;
  color: #666;
  font-size: 0.9rem;
}
</style>
