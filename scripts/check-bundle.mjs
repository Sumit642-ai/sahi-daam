/**
 * Fails if the initial JS (the entry script plus every module it preloads)
 * is over 250 KB gzipped. Run after `vite build`: npm run check:bundle
 *
 * Lazy chunks (/how-it-works, Recharts, later SheetJS) don't count; they load
 * only when needed.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const BUDGET_KB = 250
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const html = readFileSync(join(dist, 'index.html'), 'utf8')

const srcs = [
  ...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g),
  ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g),
].map((m) => m[1])

let total = 0
for (const src of new Set(srcs)) {
  const kb = gzipSync(readFileSync(join(dist, src.replace(/^\//, '')))).length / 1024
  total += kb
  console.log(`${kb.toFixed(1).padStart(7)} KB  ${src}`)
}
console.log(`${total.toFixed(1).padStart(7)} KB  initial JS, gzipped (budget ${BUDGET_KB} KB)`)
if (total > BUDGET_KB) {
  console.error('Over budget.')
  process.exit(1)
}
