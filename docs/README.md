<div style="display:flex; margin-bottom: 16px; justify-content: center;">
    <img  style="width: 35%;" src="vitella-image.png" alt="Vitella"/>
</div>

# Vitella SSR

A minimal, framework-agnostic server-side rendering framework built on Vite and Node built-in packages. Zero runtime dependencies beyond Vite. No Express, no Koa, no client-side router.

## Quick Start
Check out the documentation for a [quick start](/setup.md)

## Vitella adapters
Vitella Core is framework-agnostic — it handles routing, middleware, the HTML shell, and server management. **Adapters** bridge the gap between Vitella Core and your chosen UI framework (Vue, React, Lit, Svelte, etc.).

Currently there are 2 Vitella supported adapters
* @vitella-ssr/vue - to support SSR Vue
* @vitella-ssr/pinia - to support state store via pinia for vue

If you want to write your own adapter, you can follow the instructions [here](/creating-adapters.md).

## Why Vitella?
It is a play on Vite and Vanilla. Specificically, this is a vanilla framework with minimal dependencies - specifically one main dependency in Vite. 

In the wake of supply chain attacks, the thought was to have a simple SSR framework that would use as few depenencies as possible while still trying to achieve some developer friendliness. 

(Vitella also happens to [mean a young cow](https://dictionary.cambridge.org/us/dictionary/italian-english/vitella) - hence the image)