export const load = async ({ params }) => {
  const posts = {
    'hello-world': { title: 'Hello World', body: 'This is my first post.' },
    'ssr-explained': { title: 'SSR Explained', body: 'Server-side rendering renders HTML on the server before sending it to the client.' },
    'vanilla-js': { title: 'Vanilla JS SSR', body: 'No framework required — just JavaScript and Vite.' },
  }
  return posts[params.slug] || { title: 'Not Found', body: 'Post not found.' }
}

export default function Post({ title, body }) {
  return `
    <main>
      <article>
        <h1>${title}</h1>
        <p>${body}</p>
      </article>
      <a href="/blog">Back to Blog</a>
    </main>
  `
}
