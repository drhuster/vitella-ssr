# CLI

| Command | Description |
|---------|-------------|
| `vitella dev` | Start Vite dev server with HMR |
| `vitella build` | Build client + server bundles |
| `vitella start` | Production server (Node `http`, port from `PORT` env, default `3000`) |

In production, the server uses Node's built-in `http` module — no Vite dependency at runtime.
