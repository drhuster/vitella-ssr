/**
 * HTTP response utilities for Vitella SSR.
 *
 * Provides compression (brotli/gzip/deflate), security headers,
 * JSON/HTML response helpers, structured result detection, TTL
 * sanitization, data merging (with prototype pollution protection),
 * and filename-safe route name generation.
 */

import { IncomingMessage, ServerResponse } from 'http'
import { promisify } from 'util'
import { brotliCompress as brotliCompressCb, gzip as gzipCb, deflate as deflateCb } from 'zlib'
import type { AdapterRenderResult } from './types.js'

const brotliCompress = promisify(brotliCompressCb)
const gzip = promisify(gzipCb)
const deflate = promisify(deflateCb)

/** Maximum allowed request body size: 10 MB. */
export const MAX_BODY_SIZE = 10 * 1024 * 1024
/** Maximum allowed TTL (Cache-Control max-age): 1 year in seconds. */
export const MAX_TTL = 31536000

/** Default security headers applied to all responses. */
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

/** Apply security headers to a response, allowing user overrides for specific headers. */
export function setSecurityHeaders(res: ServerResponse, overrides?: Record<string, string>): void {
  for (const [key, value] of Object.entries(DEFAULT_SECURITY_HEADERS)) {
    res.setHeader(key, overrides?.[key] ?? value)
  }
}

/** Compress a string response body using the client's preferred encoding (brotli > gzip > deflate > none). */
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

/** Send a JSON response. */
export async function sendJson(res: ServerResponse, data: unknown, req: IncomingMessage): Promise<void> {
  await compressAndEnd(res, JSON.stringify(data), 'application/json', req)
}

/** Send an HTML response. */
export async function sendHtml(res: ServerResponse, html: string, req: IncomingMessage): Promise<void> {
  await compressAndEnd(res, html, 'text/html', req)
}

/** Type guard: check if an adapter render result is a structured object (with html/head/title) vs. a plain string. */
export function isStructuredResult(result: unknown): result is AdapterRenderResult {
  return typeof result === 'object' && result !== null && typeof (result as AdapterRenderResult).html === 'string'
}

/** Validate and sanitize a TTL value: must be a finite positive number within MAX_TTL. */
export function sanitizeTtl(ttl: unknown): number | undefined {
  if (typeof ttl === 'number' && Number.isFinite(ttl) && ttl > 0 && ttl <= MAX_TTL) {
    return Math.floor(ttl)
  }
  return undefined
}

/**
 * Merge data from a page/layout load() function into the target object.
 * Skips 'ttl' (extracted separately), and blocks prototype pollution keys
 * (__proto__, constructor, prototype). Returns the extracted ttl value.
 */
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

/** Convert a route path to a filesystem-safe name (replace slashes and colons, remove leading underscore). */
export function safeName(routePath: string, fallback: string): string {
  return routePath.replace(/\//g, '_').replace(/:/g, '_').replace(/^_/, '') || fallback
}
