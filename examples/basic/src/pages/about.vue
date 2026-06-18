<script>
export const load = async () => {
  return { version: '0.1.0' }
}
</script>

<template>
  <main>
    <h1>About Vitella</h1>
    <p>Version: {{ version }}</p>
    <a href="/">Home</a>
  </main>
</template>

<script setup>
defineProps(['version'])
</script>
