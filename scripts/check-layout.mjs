/**
 * Walks the MVP flows at phone (360 × 640), tablet and laptop sizes, in
 * English and Hindi, landscape and 125% text; screenshots each screen and
 * reports horizontal overflow, tap targets under 48 px and page errors.
 *
 *   npm run build && npx vite preview --port 4173     (in one terminal)
 *   npm run check:layout -- <out-dir>                  (in another)
 *
 * Uses the installed Chrome (Playwright channel "chrome").
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = 'http://localhost:4173'
const OUT = process.argv[2] ?? 'layout-shots'
mkdirSync(OUT, { recursive: true })

const sizes = [
  ['phone', 360, 640],
  ['tablet', 800, 1024],
  ['laptop', 1366, 800],
]

const browser = await chromium.launch({ channel: 'chrome' })
const problems = []

async function check(page, label) {
  await page.waitForTimeout(350)
  const r = await page.evaluate(() => {
    const doc = document.documentElement
    const overflow = doc.scrollWidth - doc.clientWidth
    const small = [...document.querySelectorAll('a, button, input, select, [role=radio]')]
      .filter((el) => {
        const s = getComputedStyle(el)
        if (s.display === 'none' || s.visibility === 'hidden') return false
        const b = el.getBoundingClientRect()
        if (b.width === 0 || b.height === 0) return false
        if (el.matches('input[type=radio]')) return false // the whole label is the target
        if (el.closest('.sr-only')) return false
        return b.height < 47.5
      })
      .map((el) => `${el.tagName.toLowerCase()}:"${(el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 30)}" h=${Math.round(el.getBoundingClientRect().height)}`)
    const smallText = [...document.querySelectorAll('main p, main span, main label, main li')]
      .filter((el) => el.children.length === 0 && el.textContent.trim().length > 0)
      .map((el) => parseFloat(getComputedStyle(el).fontSize))
      .filter((px) => px < 14)
    return { overflow, small, smallText: smallText.length }
  })
  if (r.overflow > 0) problems.push(`${label}: horizontal overflow ${r.overflow}px`)
  if (r.small.length) problems.push(`${label}: small tap targets ${r.small.join(', ')}`)
  await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: true })
}

for (const [name, w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => problems.push(`${name}: page error ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && problems.push(`${name}: console ${m.text()}`))

  await page.goto(`${BASE}/`)
  await page.getByRole('heading', { level: 1 }).waitFor()
  await check(page, `${name}-01-landing`)

  await page.getByRole('link', { name: 'Type in one product' }).click()
  await check(page, `${name}-02-language`)
  await page.getByRole('button', { name: 'English' }).click()
  await page.getByRole('heading', { name: 'About your shop' }).waitFor()
  await check(page, `${name}-03-shop`)
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('heading', { name: 'Add a product' }).waitFor()
  await check(page, `${name}-04-form-empty`)

  await page.getByLabel('Product name').fill('Blue rayon kurti with a really long descriptive name for overflow')
  await page.getByLabel(/Product cost/).fill('150')
  await page.getByLabel(/Packed weight/).fill('350')
  await page.getByLabel(/Current price/).fill('300')
  await page.getByRole('button', { name: /More details/ }).click()
  await page.getByLabel(/Orders per week/).fill('40')
  await check(page, `${name}-05-form-filled`)
  await page.getByRole('button', { name: 'Save product' }).click()
  await page.getByText(/^At ₹/).waitFor()
  await check(page, `${name}-06-detail`)

  // Two more products so the leak finder has something to rank.
  for (const [n, price] of [
    ['Cotton dupatta', '240'],
    ['Printed saree', '285'],
  ]) {
    await page.goto(`${BASE}/products/new`)
    await page.getByLabel('Product name').fill(n)
    await page.getByLabel(/Product cost/).fill('150')
    await page.getByLabel(/Packed weight/).fill('350')
    await page.getByLabel(/Current price/).fill(price)
    await page.getByRole('button', { name: /More details/ }).click()
    await page.getByLabel(/Orders per week/).fill('25')
    await page.getByRole('button', { name: 'Save product' }).click()
    await page.getByText(/^At ₹/).waitFor()
  }

  await page.goto(`${BASE}/home`)
  await page.getByRole('heading', { name: 'Your products' }).waitFor()
  await check(page, `${name}-07-home`)

  await page.goto(`${BASE}/products`)
  await page.getByRole('heading', { name: 'Products' }).waitFor()
  await check(page, `${name}-08-products`)

  await page.goto(`${BASE}/me`)
  await page.getByRole('heading', { name: 'Me' }).waitFor()
  await check(page, `${name}-09-me`)

  // Hindi, at phone size this is the one most likely to overflow.
  await page.getByRole('button', { name: 'हिं' }).first().click()
  await page.goto(`${BASE}/home`)
  await page.getByRole('heading', { name: 'आपके प्रोडक्ट' }).waitFor()
  await check(page, `${name}-10-home-hi`)
  const fs = await page.evaluate(() => getComputedStyle(document.querySelector('main p')).fontSize)
  if (name === 'phone') console.log('Hindi body font-size:', fs)

  await page.goto(`${BASE}/how-it-works`)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/${name}-11-how-it-works.png` })

  if (name === 'laptop') {
    await page.goto(`${BASE}/home`)
    await page.getByRole('button', { name: 'फ़ोन फ़्रेम' }).click()
    const frame = page.frameLocator('iframe[title="Sahi Daam"]')
    await frame.getByRole('navigation').first().waitFor()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${OUT}/laptop-12-phone-frame.png` })
    const innerWidth = await page.locator('iframe').evaluate((f) => f.contentWindow.innerWidth)
    console.log('phone frame inner width:', innerWidth)
    await page.getByRole('button', { name: 'फ़ोन फ़्रेम बंद करें' }).click()
    await page.getByRole('heading', { name: 'आपके प्रोडक्ट' }).waitFor()
  }
  if (name === 'phone') {
    // Landscape on a budget phone.
    await page.setViewportSize({ width: 640, height: 360 })
    await page.goto(`${BASE}/home`)
    await page.waitForTimeout(500)
    await check(page, `${name}-12-landscape`)
    // Larger-text setting: 125% root size.
    await page.setViewportSize({ width: 360, height: 640 })
    await page.addStyleTag({ content: 'html{font-size:125% !important}' })
    await check(page, `${name}-13-large-text`)
  }
  await ctx.close()
}

await browser.close()
console.log(problems.length ? problems.join('\n') : 'No problems found.')
