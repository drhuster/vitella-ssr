<script>
export const load = async () => {
  return { version: '0.1.0' }
}
</script>

<template>
  <main>
    <h1>About Vitella</h1>
    <p>Version: {{ version }}</p>
    <button @click="handleClick">Count: {{ count }}</button>
  </main>
</template>

<script setup>
import { ref } from 'vue'
import { useHead } from '@vitella-ssr/vue'
defineProps(['version'])

useHead({
  title: 'About Vitella',
  meta: [{ name: 'description', content: 'Learn about Vitella SSR' }],
})

const count = ref(0)

const handleClick = () => {
  count.value++
}
</script>

<style lang="css" scoped>
main {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 80vh;
}
h1 {
  font-size: 2rem;
  margin-bottom: 1rem;
}
</style>