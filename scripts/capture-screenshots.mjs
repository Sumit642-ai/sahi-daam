/**
 * Captures the submission screenshots from the LIVE deploy.
 *
 *   node scripts/capture-screenshots.mjs [baseUrl] [name ...]
 *
 * With names (floor, band, beauty, whatsapp_hi, journey, sale_check,
 * meesho_view) only those are captured; with none, all of them.
 *
 * Every shot is cropped to the cards it is about, not the full page, at
 * device scale factor 2. Each capture waits for network idle plus 1.5 s so
 * the charts have finished drawing. Stops before capturing anything if the
 * floor card does not say ₹318 — that means the deploy is stale.
 */
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const BASE = args.find((a) => a.startsWith('http')) ?? 'https://sahi-daam-beta.vercel.app/?demo=ramesh'
const only = args.filter((a) => !a.startsWith('http'))
const want = (name) => only.length === 0 || only.includes(name)
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'screenshots')
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }
const PAD = 16

mkdirSync(OUT, { recursive: true })

async function settle(page) {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)
}

async function open(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await settle(page)
  return { context, page }
}

async function tab(page, name) {
  await page.getByRole('button', { name }).first().click()
  await settle(page)
}

/** The card (Card renders a <section>) that contains `text`. */
const card = (page, text) => page.locator('section', { hasText: text }).last()

/** Screenshot the union of several elements, in page coordinates, padded. */
async function shootUnion(page, locators, file) {
  const boxes = []
  for (const loc of locators) {
    await loc.first().scrollIntoViewIfNeeded()
    boxes.push(
      await loc.first().evaluate((el) => {
        const r = el.getBoundingClientRect()
        return { x: r.left + scrollX, y: r.top + scrollY, r: r.right + scrollX, b: r.bottom + scrollY }
      }),
    )
  }
  await settle(page)
  const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - PAD)
  const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - PAD)
  const width = Math.max(...boxes.map((b) => b.r)) + PAD - x
  const height = Math.max(...boxes.map((b) => b.b)) + PAD - y
  const path = join(OUT, file)
  await page.screenshot({ path, fullPage: true, clip: { x, y, width, height } })
  return path
}

const browser = await chromium.launch()
const written = []

try {
  // ---------------------------------------------------------- 1. floor.png
  if (want('floor')) {
    const { context, page } = await open(browser, DESKTOP)
    await tab(page, /Aapki Laagat/)
    const headline = page.locator('div.space-y-4', { hasText: 'You think you earn' }).first()
    const text = await headline.innerText()
    // The seller floor (what the seller pays), with cost-to-serve beside it.
    const expected = ['Your floor (what you pay)', '₹268', '₹312', 'most likely ₹271', 'Full cost-to-serve ₹318', 'You actually keep', '+₹29']
    const missing = expected.filter((s) => !text.toLowerCase().includes(s.toLowerCase()))
    if (missing.length > 0) {
      throw new Error(`STALE DEPLOY: the floor card is missing ${missing.join(', ')}. Nothing captured.`)
    }
    console.log('confirmed: seller floor ₹268 – ₹312, most likely ₹271; cost-to-serve ₹318; you keep +₹29')
    written.push(await shootUnion(page, [headline], 'floor.png'))
    await context.close()
  }

  // ----------------------------------------------------------- 2. band.png
  if (want('band')) {
    const { context, page } = await open(browser, DESKTOP)
    await tab(page, /Bazaar Ka Daam/)
    // The stage cards sit under "At this price", inside the crop's height
    // (the "Your price" card beside them is taller). Hide them for the shot.
    await card(page, 'Price by lifecycle stage').evaluate((el) => (el.style.visibility = 'hidden'))
    written.push(
      await shootUnion(
        page,
        [card(page, 'similar listings'), card(page, 'Drag the price'), card(page, 'Everything below is at')],
        'band.png',
      ),
    )
    await context.close()
  }

  // --------------------------------------------------------- 3. beauty.png
  if (want('beauty')) {
    const { context, page } = await open(browser, DESKTOP)
    await tab(page, /Bazaar Ka Daam/)
    const product = card(page, 'Carried from Aapki Laagat')
    await product.locator('select').selectOption({ label: 'Beauty & personal care' })
    const cost = product.getByLabel('Product cost')
    await cost.fill('152') // the cheapest NOT_VIABLE beauty cost on the seller floor
    await cost.blur()
    await settle(page)
    const notViable = card(page, 'can’t make money as listed')
    await notViable.waitFor()
    // Price it where the market is, not at the kurti's ₹300.
    await page.getByRole('button', { name: 'Match the median' }).click()
    await settle(page)
    written.push(await shootUnion(page, [card(page, 'similar listings'), notViable], 'beauty.png'))
    await context.close()
  }

  // ---------------------------------------------------- 4. whatsapp_hi.png
  if (want('whatsapp_hi')) {
    const { context, page } = await open(browser, PHONE)
    await tab(page, /Daam Badlo/)
    await page.getByRole('button', { name: 'हिं' }).first().click()
    await settle(page)
    const phone = page.locator('div.rounded-\\[2rem\\]').first()
    const bubble = await phone.innerText()
    if (!bubble.includes('T2')) throw new Error('The phone does not show the T2 festive alert.')
    written.push(await shootUnion(page, [phone], 'whatsapp_hi.png'))
    await context.close()
  }

  // -------------------------------------------------------- 5. journey.png
  if (want('journey')) {
    const { context, page } = await open(browser, DESKTOP)
    await tab(page, /Ramesh ki Kahani/)
    const chart = card(page, 'Cumulative profit')
    await chart.locator('.recharts-surface').first().waitFor()
    const week = await page.locator('input[type=range]').first().inputValue()
    const all = await page.getByRole('button', { name: 'All three', exact: true }).getAttribute('aria-pressed')
    if (week !== '26' || all !== 'true') {
      throw new Error(`Journey did not open at week 26 / All three (week ${week}, pressed ${all}).`)
    }
    const legend = await chart.innerText()
    if (!['Sahi Daam', 'Seller instinct', 'Meesho range'].every((s) => legend.includes(s))) {
      throw new Error('The cumulative chart does not show all three strategies.')
    }
    written.push(await shootUnion(page, [chart], 'journey.png'))
    await context.close()
  }

  // ------------------------------------------------------ 6. sale_check.png
  if (want('sale_check')) {
    const { context, page } = await open(browser, DESKTOP)
    await tab(page, /Bazaar Ka Daam/)
    const sale = card(page, 'Should I join this sale?')
    await sale.waitFor()
    const text = await sale.innerText()
    if (!text.includes('Skip — every sale order loses ₹31.')) {
      throw new Error('The sale check does not show the default example (Skip — every sale order loses ₹31).')
    }
    written.push(await shootUnion(page, [sale], 'sale_check.png'))
    await context.close()
  }

  // ----------------------------------------------------- 7. meesho_view.png
  if (want('meesho_view')) {
    const { context, page } = await open(browser, DESKTOP)
    await tab(page, /Meesho view/)
    const table = card(page, 'By category, at category defaults')
    await table.waitFor()
    written.push(await shootUnion(page, [table], 'meesho_view.png'))
    await context.close()
  }
} finally {
  await browser.close()
}

console.log('\nScreenshots:')
for (const path of written) console.log('  ' + path)
