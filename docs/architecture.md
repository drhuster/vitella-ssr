# Architecture

```
Dev mode:
  Request → Vite Dev Server
           → Route match?
             → Yes: page or API handler
             → No: error page (404)
           → load() throws?
             → Yes: error page (500)
           → Adapter renders component / error page
           → Core injects into HTML shell
           → Response

Production:
  vite build → route manifest JSON
  vitella start → Node http.createServer
                → Match route in manifest
                → Load pre-built server chunk
                → Adapter renders / API handler executes
                → Error? Render error page
                → Response
```

No client-side router. Navigation uses full page loads. Hydration makes pages interactive.
