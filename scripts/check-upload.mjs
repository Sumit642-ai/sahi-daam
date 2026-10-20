/**
 * Drives report upload end to end in Chrome at phone (360 × 640) and laptop
 * sizes: upload, reconciliation, quick cost entry, leak finder, product
 * detail, duplicate, mapping screen, Me → Reports. Reports overflow, page
 * errors, and any phone number reaching the mapping screen.
 *
 *   npm run build && npx vite preview --port 4173     (one terminal)
 *   npm run check:upload -- <out-dir>                  (another)
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = 'http://localhost:4173'
const OUT = process.argv[2] ?? 'layout-shots/upload'
const FIX = 'tests/fixtures/reports/synthetic'
mkdirSync(OUT, { recursive: true })
const renamed = join(OUT, 'export.csv')
writeFileSync(
  renamed,
  ['Order Ref,Item Code,Item,State,Paid,Buyer Mobile', 'A1,K-1,Blue kurti,Delivered,239.27,9800000001', 'A2,K-1,Blue kurti,Return,-200.60,9800000002', 'A3,K-1,Blue kurti,RTO,0,9800000003'].join('\n'),
)
const costs = { 'Blue Rayon Kurti': '150', 'Cotton Dupatta': '80', 'Printed Georgette Saree': '260', 'Oxidised Jhumka Earrings': '45', 'Kurti Pant Set': '230' }

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
  await page.goto(`${BASE}/start/language`)
  await page.getByRole('button', { name: 'English' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('link', { name: /Upload my Meesho report/ }).click()
  await page.getByRole('heading', { name: 'Upload your Meesho report' }).waitFor()
  await check(page, `${name}-b1-upload`)

  await page.setInputFiles('input[type=file]', `${FIX}/SAMPLE_SYNTHETIC_PAYMENT_FILE_week1.xlsx`)
  await page.getByRole('heading', { name: 'Your report is in' }).waitFor({ timeout: 15000 })
  await check(page, `${name}-b2-done`)
  for (const [product, cost] of Object.entries(costs)) {
    await page.locator('li', { hasText: product }).getByLabel('Your cost (₹ per piece)').fill(cost)
  }
  await page.getByRole('button', { name: 'Save and see what I keep' }).click()
  await page.getByRole('heading', { name: 'Products you already added' }).waitFor()
  await check(page, `${name}-b3-done-matched`)

  await page.goto(`${BASE}/home`)
  await page.getByRole('heading', { name: 'Your products' }).waitFor()
  await check(page, `${name}-b4-home`)
  await page.locator('a', { hasText: 'Blue Rayon Kurti' }).first().click()
  await page.getByText(/^At ₹/).waitFor()
  await check(page, `${name}-b5-detail`)

  await page.goto(`${BASE}/upload`)
  await page.setInputFiles('input[type=file]', `${FIX}/SAMPLE_SYNTHETIC_PAYMENT_FILE_week1.xlsx`)
  await page.getByText(/Already uploaded on/).waitFor({ timeout: 15000 })
  await check(page, `${name}-b6-duplicate`)

  await page.setInputFiles('input[type=file]', renamed)
  await page.getByRole('heading', { name: 'Match your columns' }).waitFor({ timeout: 15000 })
  await page.getByLabel('Which column is the product SKU?').selectOption({ label: 'Item Code' })
  await page.getByLabel('Which column is the order status?').selectOption({ label: 'State' })
  await check(page, `${name}-b7-map`)
  if ((await page.content()).includes('9800000001')) problems.push(`${name}: phone number visible on mapping screen`)

  await page.goto(`${BASE}/me`)
  await page.getByRole('heading', { name: 'Reports' }).waitFor()
  await check(page, `${name}-b8-me`)
  await ctx.close()
}
await browser.close()
console.log(problems.length ? problems.join('\n') : 'No problems found.')
