import type { Adapter } from '@vitella-ssr/core'
import { renderVueComponent } from './renderer.js'

export const vueAdapter: Adapter = {
  name: 'vue',
  extensions: ['.vue'],
  render: async ({ component, loadData }) => {
    return renderVueComponent(component, loadData)
  },
}
