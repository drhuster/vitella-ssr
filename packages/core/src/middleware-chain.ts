/**
 * Middleware chain runner for Vitella SSR.
 *
 * Executes an array of middleware functions sequentially. Each middleware
 * calls `next()` to pass control to the next in the chain. After all
 * middleware run, the final handler (the route dispatcher) executes.
 * Guards against multiple `next()` calls and auto-advances if a middleware
 * doesn't call `next()` but hasn't ended the response.
 */

import type { IncomingMessage, ServerResponse } from 'http'

type NextFn = () => Promise<void>
type MiddlewareFn = (req: IncomingMessage, res: ServerResponse, next: NextFn) => void | Promise<void>
type FinalHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>

/** Run the middleware chain, then call the final handler if all middleware pass control. */
export async function runMiddleware(
  middleware: MiddlewareFn[],
  req: IncomingMessage,
  res: ServerResponse,
  finalHandler?: FinalHandler
): Promise<void> {
  let index = -1

  const dispatch = async (i: number): Promise<void> => {
    if (i <= index) throw new Error('next() called multiple times')
    index = i

    if (i < middleware.length) {
      const mw = middleware[i]
      let called = false
      await mw(req, res, async () => {
        if (called) throw new Error('next() called multiple times')
        called = true
        await dispatch(i + 1)
      })
      // Auto-advance if middleware never called next() but also didn't end the response.
      if (!called && !res.writableEnded) {
        await dispatch(i + 1)
      }
    } else if (finalHandler) {
      await finalHandler(req, res)
    }
  }

  await dispatch(0)
}
