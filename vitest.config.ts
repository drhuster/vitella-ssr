import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'packages/core/vitest.config.ts',
      'packages/vue/vitest.config.ts',
      'packages/pinia/vitest.config.ts',
      'packages/create-vitella-ssr/vitest.config.js',
    ],
  },
})
