<script>
export const load = async () => {
  return { message: 'Welcome to Vitella SSR!' }
}
</script>

<template>
  <main>
    <h1>Vitella SSR</h1>
    <p>{{ message }}</p>
    <nav>
      <a href="/about">About</a>
    </nav>
  </main>
</template>

<script setup>
defineProps(['message'])
</script>
