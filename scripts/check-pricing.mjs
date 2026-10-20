/**
 * Drives the floor card, price helper and sale check in Chrome at phone
 * (360 × 640) and laptop sizes, in English and Hindi; reports horizontal
 * overflow and page errors, and screenshots each screen.
 *
 *   npm run build && npx vite preview --port 4173     (one terminal)
 *   npm run check:pricing -- <out-dir>                 (another)
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = 'http://localhost:4173'
const OUT = process.argv[2] ?? 'layout-shots/pricing'
mkdirSync(OUT, { recursive: true })
const listed = new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10)

const browser = await chromium.launch({ channel: 'chrome' })
const problems = []
async function check(page, label) {
  await page.waitForTimeout(400)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (overflow > 0) problems.push(`${label}: horizontal overflow ${overflow}px`)
  await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: true })
}

for (const [name, w, h] of [['phone', 360, 640], ['laptop', 1366, 800]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => problems.push(`${name}: page error ${e.message}`))
  await page.goto(`${BASE}/start/language?next=product`)
  await page.getByRole('button', { name: 'English' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Product name').fill('Blue rayon kurti')
  await page.getByLabel(/Product cost/).fill('150')
  await page.getByLabel(/Packed weight/).fill('350')
  await page.getByLabel(/Current price/).fill('300')
  await page.getByRole('button', { name: /More details/ }).click()
  await page.getByLabel(/Listed since/).fill(listed)
  await page.getByRole('button', { name: 'Save product' }).click()
  await page.getByText(/^At ₹300/).waitFor()
  await page.getByRole('button', { name: 'Show working' }).click()
  await check(page, `${name}-c1-floor-card`)

  await page.getByRole('link', { name: 'Price helper' }).first().click()
  await page.getByRole('heading', { name: 'Price helper' }).waitFor()
  for (const p of ['280', '300', '320', '340', '1500']) {
    await page.getByLabel('Price of a similar product (₹)').fill(p)
    await page.getByRole('button', { name: 'Add' }).click()
    await page.waitForTimeout(150)
  }
  await page.getByText('Outlier?').waitFor()
  await check(page, `${name}-c2-price-helper`)
  await page.getByRole('button', { name: /^(Use this price|Try ₹10 more)/ }).click()
  await page.getByText(/^(Price changed to|Trying ₹)/).waitFor()
  await check(page, `${name}-c3-price-applied`)

  await page.goBack()
  await page.getByRole('link', { name: 'Sale check' }).first().click()
  await page.getByRole('heading', { name: 'Sale check' }).waitFor()
  await check(page, `${name}-c4-sale-check`)

  await page.getByRole('button', { name: 'हिं' }).first().click()
  await page.goBack()
  await page.getByText(/हर बिक्री में/).first().waitFor()
  await check(page, `${name}-c5-floor-card-hi`)
  await ctx.close()
}
await browser.close()
console.log(problems.length ? problems.join('\n') : 'No problems found.')
