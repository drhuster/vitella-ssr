import { createSSRApp } from 'vue'
import { hydratePinia } from '@vitella-ssr/pinia'
import Page from "/Users/dhuster/workspace/AI-Projects/vanilla-ssr/examples/vue/src/pages/about.vue"
const __initState = typeof window !== 'undefined' ? window.__INITIAL_STATE__ || {} : {}
const pinia = hydratePinia()
const app = createSSRApp(Page, __initState)
app.use(pinia)
app.mount('#app')