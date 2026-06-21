import { IncomingMessage, ServerResponse } from 'http'
import { promisify } from 'util'
import { brotliCompress as brotliCompressCb, gzip as gzipCb, deflate as deflateCb } from 'zlib'
import type { AdapterRenderResult } from './types.js'

const brotliCompress = promisify(brotliCompressCb)
const gzip = promisify(gzipCb)
const deflate = promisify(deflateCb)

export const MAX_BODY_SIZE = 10 * 1024 * 1024
export const MAX_TTL = 31536000

export const DEFAULT_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
}

export function setSecurityHeaders(res: ServerResponse, overrides?: Record<string, string>): void {
  for (const [key, value] of Object.entries(DEFAULT_SECURITY_HEADERS)) {
    res.setHeader(key, overrides?.[key] ?? value)
  }
}

export async function compressAndEnd(res: ServerResponse, data: string, contentType: string, req: IncomingMessage): Promise<void> {
  res.setHeader('Content-Type', contentType)
  const accept = req.headers['accept-encoding'] || ''
  try {
    const buffer = Buffer.from(data, 'utf-8')
    let compressed: Buffer
    if (accept.includes('br')) {
      compressed = await brotliCompress(buffer)
      res.setHeader('Content-Encoding', 'br')
    } else if (accept.includes('gzip')) {
      compressed = await gzip(buffer)
      res.setHeader('Content-Encoding', 'gzip')
    } else if (accept.includes('deflate')) {
      compressed = await deflate(buffer)
      res.setHeader('Content-Encoding', 'deflate')
    } else {
      res.end(data)
      return
    }
    res.removeHeader('Content-Length')
    res.end(compressed)
  } catch {
    res.end(data)
  }
}

export async function sendJson(res: ServerResponse, data: unknown, req: IncomingMessage): Promise<void> {
  await compressAndEnd(res, JSON.stringify(data), 'application/json', req)
}

export async function sendHtml(res: ServerResponse, html: string, req: IncomingMessage): Promise<void> {
  await compressAndEnd(res, html, 'text/html', req)
}

export function isStructuredResult(result: unknown): result is AdapterRenderResult {
  return typeof result === 'object' && result !== null && typeof (result as AdapterRenderResult).html === 'string'
}

export function sanitizeTtl(ttl: unknown): number | undefined {
  if (typeof ttl === 'number' && Number.isFinite(ttl) && ttl > 0 && ttl <= MAX_TTL) {
    return Math.floor(ttl)
  }
  return undefined
}

export function mergeLoadResult(
  result: Record<string, unknown> | undefined,
  target: Record<string, unknown>
): number | undefined {
  if (!result) return undefined
  let pageTtl: number | undefined
  if (result.ttl !== undefined) pageTtl = result.ttl as number
  for (const key of Object.keys(result)) {
    if (key === 'ttl' || key === '__proto__' || key === 'constructor' || key === 'prototype') continue
    const desc = Object.getOwnPropertyDescriptor(result, key)
    if (desc && desc.enumerable) {
      target[key] = result[key]
    }
  }
  return pageTtl
}

export function safeName(routePath: string, fallback: string): string {
  return routePath.replace(/\//g, '_').replace(/:/g, '_').replace(/^_/, '') || fallback
}
