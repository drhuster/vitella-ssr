import type { Plugin } from 'vite'
import ejs from 'ejs'

const EJS_EXT = '.ejs'

export function ejsVitePlugin(): Plugin {
  return {
    name: 'vitella-ejs',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith(EJS_EXT)) return null
      const fn = ejs.compile(code, { client: true })
      // Wrap in new Function() to avoid strict-mode rejection of the `with`
      // statement that EJS generates internally. new Function() always
      // creates non-strict functions regardless of the caller's strict mode.
      return {
        code: `export default new Function('return ' + ${JSON.stringify(fn.toString())})()`,
        map: null,
      }
    },
  }
}
