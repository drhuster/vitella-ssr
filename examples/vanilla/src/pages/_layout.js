export default function Layout({ children }) {
  return `
    <div class="page-layout">
      <header class="site-header">
        <nav>
          <a href="/">Home</a>
          <a href="/about">About</a>
          <a href="/blog">Blog</a>
        </nav>
      </header>
      ${children}
      <footer class="site-footer">
        <p>Vitella SSR — powered by Vite</p>
      </footer>
    </div>
  `
}
