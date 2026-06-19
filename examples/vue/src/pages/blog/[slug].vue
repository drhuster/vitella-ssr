<script>
export const load = async ({ params }) => {
  const posts = {
    'hello-world': { title: 'Hello World', body: 'This is my first post.' },
    'ssr-explained': { title: 'SSR Explained', body: 'Server-side rendering renders pages on the server.' },
  }
  return posts[params.slug] || { title: 'Not Found', body: 'Post not found.' }
}
</script>

<template>
  <main>
    <article>
      <h1>{{ title }}</h1>
      <p>{{ body }}</p>
    </article>
    <a href="/blog">Back to Blog</a>
  </main>
</template>

<script setup>
defineProps(['title', 'body'])
</script>
