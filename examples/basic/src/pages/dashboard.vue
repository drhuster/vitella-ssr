<script>
export const load = async () => {
  return { stats: { users: 1243, pages: 47, uptime: '99.9%' } }
}
</script>

<template>
  <main>
    <h1>Dashboard</h1>
    <div class="stats">
      <div><strong>Users:</strong> {{ stats.users }}</div>
      <div><strong>Pages:</strong> {{ stats.pages }}</div>
      <div><strong>Uptime:</strong> {{ stats.uptime }}</div>
    </div>
    <a href="/">Home</a>
  </main>
</template>

<script setup>
defineProps(['stats'])
</script>
