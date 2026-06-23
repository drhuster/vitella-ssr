export default function ErrorPage({ statusCode, statusMessage }) {
  return `<main>
    <h1>${statusCode}</h1>
    <p>${statusMessage}</p>
    <a href="/">Go Home</a>
  </main>`
}
