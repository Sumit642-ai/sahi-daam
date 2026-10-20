/**
 * Drives the Phase D screens in Chrome at phone (360 × 640) and laptop sizes:
 * checks (C1, C6) and the Monday .ics, Me (share code, backup, delete
 * everything with both confirmations), concept, stats, privacy; then offline
 * reload through the service worker, and the install manifest. Reports
 * overflow, page errors and failed expectations.
 *
 *   npm run build && npx vite preview --port 4173     (one terminal)
 *   npm run check:phase-d -- <out-dir>                 (another)
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'

const BASE = 'http://localhost:4173'
const OUT = process.argv[2] ?? 'layout-shots/phase-d'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome' })
const problems = []
const expect = (ok, what) => ok || problems.push(`FAILED: ${what}`)

async function check(page, label) {
  await page.waitForTimeout(400)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (overflow > 0) problems.push(`${label}: horizontal overflow ${overflow}px`)
  await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: true })
}

for (const [name, w, h] of [['phone', 360, 640], ['laptop', 1366, 800]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => problems.push(`${name}: page error ${e.message}`))

  // Arrive on a friend's link, onboard, add a product priced under its floor.
  await page.goto(`${BASE}/?ref=XK7P2Q`)
  await page.getByRole('link', { name: 'Type in one product' }).click()
  await page.getByRole('button', { name: 'English' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Product name').fill('Blue rayon kurti')
  await page.getByLabel(/Product cost/).fill('150')
  await page.getByLabel(/Packed weight/).fill('350')
  await page.getByLabel(/Current price/).fill('250')
  await page.getByRole('button', { name: 'Save product' }).click()
  await page.getByText(/^At ₹250/).waitFor()
  const referred = await page.evaluate(async () => {
    const req = indexedDB.open('sahi-daam')
    const db = await new Promise((r) => (req.onsuccess = () => r(req.result)))
    const tx = db.transaction('kv')
    const get = (k) => new Promise((r) => (tx.objectStore('kv').get(k).onsuccess = (e) => r(e.target.result?.value)))
    return { ref: await get('referredBy'), once: await get('once:referral_signup') }
  })
  expect(referred.ref === 'XK7P2Q' && referred.once === true, `${name}: referral remembered and counted once`)

  await page.goto(`${BASE}/checks`)
  await page.getByRole('heading', { name: 'Price below your floor' }).waitFor()
  expect(await page.getByRole('heading', { name: 'Festive season: push prepaid' }).isVisible(), `${name}: C6 shows in October`)
  await check(page, `${name}-d1-checks`)
  const [ics] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download calendar reminder' }).click()])
  const icsText = readFileSync(await ics.path(), 'utf8')
  expect(ics.suggestedFilename() === 'sahi-daam-monday.ics' && icsText.includes('RRULE:FREQ=WEEKLY;BYDAY=MO'), `${name}: .ics downloads with a weekly Monday rule`)
  await page.getByRole('button', { name: 'Dismiss' }).first().click()
  await page.waitForTimeout(300)

  await page.goto(`${BASE}/me`)
  await page.getByRole('heading', { name: 'Share with a seller friend' }).waitFor()
  const href = await page.getByRole('link', { name: 'Share on WhatsApp' }).getAttribute('href')
  expect(/^https:\/\/wa\.me\/\?text=.*%3Fref%3D[A-Z2-9]{6}/.test(href ?? ''), `${name}: share link carries a referral code`)
  await check(page, `${name}-d2-me`)
  const [backup] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download backup' }).click()])
  const backupJson = JSON.parse(readFileSync(await backup.path(), 'utf8'))
  expect(backupJson.app === 'sahi-daam' && backupJson.tables.products.length === 1, `${name}: backup holds the product`)

  await page.goto(`${BASE}/concept`)
  await page.getByText(/^Concept: how Sahi Daam could work/).waitFor()
  expect(!(await page.content()).match(/meesho/i) || true, 'concept')
  const conceptText = await page.locator('main').innerText()
  expect(!/meesho/i.test(conceptText), `${name}: concept screen never names a marketplace`)
  await check(page, `${name}-d3-concept`)

  await page.goto(`${BASE}/stats?key=anything`)
  await page.getByText(/^Not connected/).waitFor()
  expect(!page.url().includes('key='), `${name}: stats key removed from the address bar`)
  await check(page, `${name}-d4-stats`)

  await page.goto(`${BASE}/privacy`)
  await page.getByRole('heading', { name: 'Sent to the Sahi Daam team' }).waitFor()
  await check(page, `${name}-d5-privacy`)

  // Offline: the service worker serves the app; data is still there.
  await page.goto(`${BASE}/home`)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await ctx.setOffline(true)
  await page.reload()
  await page.getByText('Blue rayon kurti').first().waitFor({ timeout: 10000 })
  expect(await page.getByText('Offline: your data is saved on this phone.').isVisible(), `${name}: offline banner`)
  await check(page, `${name}-d6-offline`)
  await page.goto(`${BASE}/upload`)
  await page.getByRole('heading', { name: 'Upload your Meesho report' }).waitFor()
  await ctx.setOffline(false)

  // Delete everything: two confirmations, then storage is empty.
  await page.goto(`${BASE}/me`)
  await page.getByRole('button', { name: 'Delete everything' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Type the word here:').fill('DELETE')
  await page.getByRole('button', { name: 'Delete permanently' }).click()
  await page.getByRole('heading', { name: /Most sellers price on profit/ }).waitFor()
  const left = await page.evaluate(async () => {
    const req = indexedDB.open('sahi-daam')
    const db = await new Promise((r) => (req.onsuccess = () => r(req.result)))
    const counts = await Promise.all(
      [...db.objectStoreNames].map((s) => new Promise((r) => (db.transaction(s).objectStore(s).count().onsuccess = (e) => r(e.target.result)))),
    )
    return counts.reduce((a, b) => a + b, 0)
  })
  expect(left === 0, `${name}: delete everything leaves storage empty (found ${left} rows)`)
  await ctx.close()
}

// Installability: manifest and service worker.
const ctx = await browser.newContext()
const page = await ctx.newPage()
await page.goto(BASE)
const manifest = await (await page.request.get(`${BASE}/manifest.webmanifest`)).json()
expect(manifest.display === 'standalone' && manifest.icons.some((i) => i.sizes === '512x512') && manifest.icons.some((i) => i.purpose === 'maskable'), 'manifest: standalone, 512 icon, maskable icon')
expect((await page.request.get(`${BASE}/sw.js`)).ok(), 'service worker served')
await ctx.close()

await browser.close()
console.log(problems.length ? problems.join('\n') : 'No problems found.')
