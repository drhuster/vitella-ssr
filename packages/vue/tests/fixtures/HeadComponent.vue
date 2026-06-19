<script setup>
import { useHead } from '../../src/use-head.js'

defineProps(['title'])

useHead({
  title: 'Test Page',
  meta: [{ name: 'description', content: 'Test Page' }],
})
</script>

<template>
  <div>
    <h1>Custom Head Page</h1>
  </div>
</template>
