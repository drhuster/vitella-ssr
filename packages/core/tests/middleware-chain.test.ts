import { describe, it, expect, vi } from 'vitest'
import { runMiddleware } from '../src/middleware-chain.js'
import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'

function createReqRes() {
  const req = new IncomingMessage(new Socket())
  const res = new ServerResponse(req)
  return { req, res }
}

describe('runMiddleware', () => {
  it('executes middleware in order', async () => {
    const { req, res } = createReqRes()
    const order: number[] = []

    const mw1 = async (_r: any, _s: any, next: any) => { order.push(1); await next() }
    const mw2 = async (_r: any, _s: any, next: any) => { order.push(2); await next() }
    const mw3 = async (_r: any, _s: any, next: any) => { order.push(3); await next() }

    await runMiddleware([mw1, mw2, mw3], req, res)
    expect(order).toEqual([1, 2, 3])
  })

  it('passes data through req object', async () => {
    const { req, res } = createReqRes()

    const mw1 = async (r: any, _s: any, next: any) => { (r as any).user = 'test-user'; await next() }
    const mw2 = async (r: any, _s: any, next: any) => { expect((r as any).user).toBe('test-user'); await next() }

    await runMiddleware([mw1, mw2], req, res)
  })

  it('calls final handler after all middleware', async () => {
    const { req, res } = createReqRes()
    const handler = vi.fn()

    await runMiddleware([], req, res, handler)
    expect(handler).toHaveBeenCalledWith(req, res)
  })

  it('skips final handler if middleware does not call next', async () => {
    const { req, res } = createReqRes()
    const handler = vi.fn()

    const mw = (_r: any, _s: any, _next: any) => { /* does not call next */ }

    await runMiddleware([mw], req, res, handler)
    expect(handler).not.toHaveBeenCalled()
  })

  it('throws on double next() call', async () => {
    const { req, res } = createReqRes()

    const mw = async (_r: any, _s: any, next: any) => {
      await next()
      await expect(next()).rejects.toThrow('multiple times')
    }

    await runMiddleware([mw], req, res)
  })
})
