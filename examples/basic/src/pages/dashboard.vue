<script>
export const load = async () => ({
  stats: { users: 1243, pages: 47, uptime: '99.9%' },
})
</script>

<template>
  <main>
    <h1>Dashboard</h1>
    <div class="stats">
      <div><strong>Users:</strong> {{ stats.users }}</div>
      <div><strong>Pages:</strong> {{ stats.pages }}</div>
      <div><strong>Uptime:</strong> {{ stats.uptime }}</div>
    </div>
    <section>
      <h2>Pinia Counter (shared across pages)</h2>
      <p>Count: {{ counter.count }}</p>
      <button @click="counter.increment">+1</button>
    </section>
  </main>
</template>

<script setup>
import { useCounterStore } from '../stores/counter'
defineProps(['stats'])

const counter = useCounterStore()
</script>
