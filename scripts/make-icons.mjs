/**
 * Renders the PWA icons from the ₹ mark (public/favicon.svg) with the
 * installed Chrome: 192 and 512 px, and a 512 px maskable icon whose mark
 * sits inside the 80% safe zone. Run once: node scripts/make-icons.mjs
 */
import { chromium } from 'playwright'

const mark = (size, maskable) => `<!doctype html><html><body style="margin:0">
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="${maskable ? 0 : 14}" fill="#5B1A46"/>
  <text x="32" y="${maskable ? 42 : 45}" font-family="Arial, sans-serif" font-size="${maskable ? 28 : 38}" font-weight="700" text-anchor="middle" fill="#F58220">₹</text>
</svg></body></html>`

const browser = await chromium.launch({ channel: 'chrome' })
for (const [file, size, maskable] of [
  ['public/icon-192.png', 192, false],
  ['public/icon-512.png', 512, false],
  ['public/icon-maskable-512.png', 512, true],
  ['public/apple-touch-icon.png', 180, true],
]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(mark(size, maskable))
  await page.locator('svg').screenshot({ path: file, omitBackground: !maskable })
  await page.close()
  console.log('wrote', file)
}
await browser.close()
