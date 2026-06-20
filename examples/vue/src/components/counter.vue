<template>
    <section>
      <h2>Pinia Counter (shared across pages)</h2>
      <p>Count: {{ counter.count }}</p>
      <button @click="counter.increment">+1</button>
    </section>
</template>

<script setup>
import { ref } from 'vue'
import { useCounterStore } from '../stores/counter'

const counter = useCounterStore()
</script>