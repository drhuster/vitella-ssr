<div style="display:flex; margin-bottom: 16px; justify-content: center;">
    <img  style="width: 35%;" src="vitella-image.png" alt="Vitella"/>
</div>

# Vitella SSR

A minimal, framework-agnostic server-side rendering framework built on Vite and Node built-in packages. Zero runtime dependencies beyond Vite. No Express, no Koa, no client-side router.

## Why Vitella?
It is a play on Vite and Vanilla. Specifically, this is a vanilla framework with minimal dependencies — one main dependency in Vite. In the wake of supply chain attacks, the thought was to have a simple SSR framework that would use as few dependencies as possible while still achieving developer friendliness. (Vitella also happens to [mean a young cow](https://dictionary.cambridge.org/us/dictionary/italian-english/vitella) — hence the image.)

## Documentation

- [Getting Started](getting-started.md) — Install, configure, project structure
- [Routing](routing.md) — Page routes, API routes, error pages
- [Data Loading](data-loading.md) — Load functions, context, cookies
- [Middleware](middleware.md) — Global middleware
- [Adapters](adapters.md) — Vue, Pinia, and custom adapters
- [Creating Adapters](creating-adapters.md) — Build adapters for React, Lit, etc.
- [HTML Shell](html-shell.md) — Template placeholders reference
- [Configuration](configuration.md) — Plugin options reference
- [CLI](cli.md) — Command reference
- [Architecture](architecture.md) — Dev and production flow