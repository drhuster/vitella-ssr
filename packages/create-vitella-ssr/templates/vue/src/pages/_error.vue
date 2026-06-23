<template>
  <main>
    <h1>{{ statusCode }}</h1>
    <p>{{ statusMessage }}</p>
    <a href="/">Go Home</a>
  </main>
</template>

<script setup>
defineProps(['statusCode', 'statusMessage', 'url'])
</script>
