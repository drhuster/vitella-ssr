export default function Home({ message }) {
  return `<main>
    <h1>${message}</h1>
    <p>Welcome to your new Vitella SSR site.</p>
    <nav><a href="/about">About</a></nav>
  </main>`
}

export const load = async () => {
  return { message: 'Welcome to Vitella SSR!' }
}
