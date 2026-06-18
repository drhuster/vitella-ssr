import type { IncomingMessage, ServerResponse } from 'http'

type NextFn = () => Promise<void>
type MiddlewareFn = (req: IncomingMessage, res: ServerResponse, next: NextFn) => void | Promise<void>
type FinalHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>

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
    } else if (finalHandler) {
      await finalHandler(req, res)
    }
  }

  await dispatch(0)
}
