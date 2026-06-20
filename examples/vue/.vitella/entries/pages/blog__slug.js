import { createSSRApp } from 'vue'
import Page from "/Users/dhuster/workspace/AI-Projects/vanilla-ssr/examples/vue/src/pages/blog/[slug].vue"
const __initState = typeof window !== 'undefined' ? window.__INITIAL_STATE__ || {} : {}
const app = createSSRApp(Page, __initState)
app.mount('#app')