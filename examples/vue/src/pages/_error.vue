<script setup>
defineProps({
  statusCode: Number,
  statusMessage: String,
  url: String,
})
</script>

<template>
  <main class="error-page">
    <h1>{{ statusCode }}</h1>
    <p class="message">{{ statusMessage }}</p>
    <p class="url" v-if="url">Path: <code>{{ url }}</code></p>
    <a href="/" class="home-link">Back to Home</a>
  </main>
</template>

<style scoped>
.error-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 70vh;
  text-align: center;
}

h1 {
  font-size: 5rem;
  margin: 0;
  color: #e74c3c;
  line-height: 1;
}

.message {
  font-size: 1.5rem;
  margin: 0.5rem 0 1rem;
  color: #555;
}

.url {
  font-size: 0.9rem;
  color: #999;
  margin-bottom: 2rem;
}

.url code {
  background: #f5f5f5;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
}

.home-link {
  display: inline-block;
  padding: 0.75rem 1.5rem;
  background: #3498db;
  color: white;
  text-decoration: none;
  border-radius: 6px;
  font-weight: 600;
  transition: background 0.2s;
}

.home-link:hover {
  background: #2980b9;
}
</style>
