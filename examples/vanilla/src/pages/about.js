export const load = async () => {
  return { version: '0.1.0', framework: 'Vanilla JS' }
}

export default function About({ version, framework }) {
  return `
    <main>
      <h1>About</h1>
      <p>Version: ${version}</p>
      <p>Framework: ${framework}</p>
      <a href="/">Home</a>
    </main>
  `
}
