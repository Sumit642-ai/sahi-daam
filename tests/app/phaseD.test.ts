import 'fake-indexeddb/auto'

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BACKUP_APP, deleteEverything, exportBackup, parseBackup, restoreBackup } from '../../src/app/backup'
import { type Product, SahiDaamDb } from '../../src/app/db'
import { computeChecks, inFestiveWindow } from '../../src/app/lib/checks'
import { mondayReminderIcs, nextMonday } from '../../src/app/lib/ics'
import { keepInputFor, linkFor, summarise } from '../../src/app/lib/products'
import { judgeProductStep, stepReports } from '../../src/app/lib/steps'
import { sha256HexSync } from '../../src/app/report/hash'
import { latestBySku, saveReport } from '../../src/app/report/store'
import {
  addProduct,
  closePriceStep,
  dismissCheck,
  newShop,
  saveCompetitorPrices,
  saveShop,
  startPriceStep,
  syncChecks,
  updateProduct,
} from '../../src/app/repo'
import {
  DAILY_EVENT_CAP,
  REF_PATTERN,
  cleanProps,
  flush,
  readLaunchParams,
  referralCode,
  shareUrl,
  track,
  whatsappLink,
} from '../../src/app/telemetry'
import { judgeStep } from '../../src/engine/priceStep'
import { SYNTHETIC_DIR, loadReport } from '../fixtures/reports/loadReport'

let db: SahiDaamDb
const shop = { ...newShop('en', 0), onboardedAt: 1 }
const OCT_20 = Date.parse('2026-10-20T12:00:00')

beforeEach(async () => {
  db = new SahiDaamDb(`d-${Math.random().toString(36).slice(2)}`)
  await db.open()
  vi.stubGlobal('navigator', { onLine: true })
})
afterEach(async () => {
  vi.unstubAllGlobals()
  await db.delete()
})

async function upload(name: string, now: number) {
  const path = join(SYNTHETIC_DIR, name)
  const { analysis, data } = loadReport(path)
  return saveReport({ fileName: name, fileHash: sha256HexSync(new Uint8Array(readFileSync(path))), data, mappingId: 'auto', synthetic: analysis.synthetic }, db, now)
}

async function fixtureProducts(): Promise<Product[]> {
  const out: Product[] = []
  for (const [sku, name, cost, weightG, category] of [
    ['KURTI-BLUE-01', 'Blue Rayon Kurti', 150, 350, 'ethnic_women'],
    ['JHUMKA-04', 'Oxidised Jhumka Earrings', 45, 100, 'jewellery'],
    ['DUPATTA-COT-02', 'Cotton Dupatta', 80, 250, 'ethnic_women'],
  ] as const) {
    out.push(await addProduct({ name, sku, category, cost, weightG, price: 1 }, db, 0))
  }
  return out
}

async function checksNow(now = OCT_20) {
  const products = await db.products.toArray()
  const rows = await db.skuStats.toArray()
  const reports = await db.reports.toArray()
  const links = latestBySku(rows, reports)
  const summaries = new Map(products.map((p) => [p.id, summarise(p, shop, linkFor(p, links))]))
  const steps = (await db.priceSteps.toArray()).map((step) => {
    const product = products.find((p) => p.id === step.productId)!
    const j = judgeProductStep({ step, sku: product.sku, base: keepInputFor(product, shop), rows, reports })
    return { step, verdict: j.verdict, change: j.change }
  })
  return computeChecks({ products, summaries, rows, reports, competitor: await db.competitor.toArray(), steps, shop, now })
}

// ----------------------------------------------------------------- checks

describe('weekly checks (7.8; Section 15, positive 7)', () => {
  it('C2 fires on the kurti (returns 16% → 23%) and C3 on the jhumka (RTO 22% → 28%) across two reports', async () => {
    const [kurti, jhumka, dupatta] = await fixtureProducts()
    await upload('SAMPLE_SYNTHETIC_PAYMENT_FILE_week1.xlsx', 1000)
    expect((await checksNow()).filter((c) => c.rule === 'C2' || c.rule === 'C3')).toEqual([])

    await upload('SAMPLE_SYNTHETIC_PAYMENT_FILE_week2.xlsx', 2000)
    const checks = await checksNow()
    const c2 = checks.filter((c) => c.rule === 'C2')
    const c3 = checks.filter((c) => c.rule === 'C3')
    expect(c2).toMatchObject([{ productId: kurti!.id, payload: { from: 16, to: 23 } }])
    expect(c3).toMatchObject([{ productId: jhumka!.id, payload: { from: 22, to: 28 } }])
    expect(checks.some((c) => c.productId === dupatta!.id && (c.rule === 'C2' || c.rule === 'C3'))).toBe(false)
  })

  it('C1 fires for a price below the floor, C4 for a cost change over 5%, C5 for an undercut over 8%', async () => {
    const p = await addProduct({ name: 'K', category: 'ethnic_women', cost: 150, weightG: 350, price: 250 }, db, 0)
    await updateProduct(p.id, { name: 'K', category: 'ethnic_women', cost: 170, weightG: 350, price: 250 }, db, 5000)
    await saveCompetitorPrices(p.id, [210, 220, 230], db)
    const rules = (await checksNow()).filter((c) => c.productId === p.id).map((c) => c.rule).sort()
    expect(rules).toEqual(['C1', 'C4', 'C5'])
  })

  it('C6 only from 1 Oct to 15 Nov, for a COD-heavy shop', async () => {
    await addProduct({ name: 'K', category: 'ethnic_women', cost: 150, weightG: 350, price: 300 }, db, 0)
    expect(inFestiveWindow(Date.parse('2026-10-01T09:00:00'))).toBe(true)
    expect(inFestiveWindow(Date.parse('2026-11-15T23:00:00'))).toBe(true)
    expect(inFestiveWindow(Date.parse('2026-11-16T09:00:00'))).toBe(false)
    expect((await checksNow(OCT_20)).some((c) => c.rule === 'C6')).toBe(true)
    expect((await checksNow(Date.parse('2026-12-20T12:00:00'))).some((c) => c.rule === 'C6')).toBe(false)
  })

  it('dedupe: one active per rule and product; dismissed stays dismissed; resolved closes itself', async () => {
    const p = await addProduct({ name: 'K', category: 'ethnic_women', cost: 150, weightG: 350, price: 250 }, db, 0)
    await syncChecks(await checksNow(Date.parse('2026-12-20T12:00:00')), db)
    await syncChecks(await checksNow(Date.parse('2026-12-20T12:00:00')), db)
    const active = () => db.checks.where('status').equals('active').toArray()
    expect((await active()).map((c) => c.rule)).toEqual(['C1'])

    await dismissCheck((await active())[0]!.id, db)
    await syncChecks(await checksNow(Date.parse('2026-12-20T12:00:00')), db)
    expect(await active()).toEqual([])

    // A new price still below the floor is a new fact: shown again, once.
    await updateProduct(p.id, { name: 'K', category: 'ethnic_women', cost: 150, weightG: 350, price: 260 }, db, 9000)
    await syncChecks(await checksNow(Date.parse('2026-12-20T12:00:00')), db)
    expect((await active()).map((c) => c.payload.price)).toEqual([260])

    // Fixed: the check closes itself.
    await updateProduct(p.id, { name: 'K', category: 'ethnic_women', cost: 150, weightG: 350, price: 320 }, db, 9500)
    await syncChecks(await checksNow(Date.parse('2026-12-20T12:00:00')), db)
    expect(await active()).toEqual([])
  })
})

// ------------------------------------------------------------ price steps

describe('price step planner (7.9; Section 15, positive 8)', () => {
  it('too early below 20 clean sales or under 7 days, whatever the numbers say', () => {
    const big = { cleanSales: 100, days: 7, keep: 30 }
    expect(judgeStep({ before: big, after: { cleanSales: 19, days: 7, keep: 90 } })).toMatchObject({ verdict: 'TOO_EARLY', reason: 'FEW_SALES' })
    expect(judgeStep({ before: big, after: { cleanSales: 100, days: 6, keep: 90 } })).toMatchObject({ verdict: 'TOO_EARLY', reason: 'SHORT_PERIOD' })
    expect(judgeStep({ before: big, after: null })).toMatchObject({ verdict: 'TOO_EARLY', reason: 'NO_AFTER' })
  })

  it('keep on a clear improvement, go back on a clear drop, too early in between', () => {
    const before = { cleanSales: 70, days: 7, keep: 30 } // ₹300 a day
    expect(judgeStep({ before, after: { cleanSales: 66, days: 7, keep: 39 } }).verdict).toBe('KEEP') // ₹367.7 a day, +22.6%
    expect(judgeStep({ before, after: { cleanSales: 40, days: 7, keep: 39 } }).verdict).toBe('GO_BACK') // ₹222.9 a day, −25.7%
    expect(judgeStep({ before, after: { cleanSales: 50, days: 7, keep: 39 } })).toMatchObject({ verdict: 'TOO_EARLY', reason: 'SMALL_CHANGE' }) // −7%
  })

  it('…and the catalogue trend is taken out', () => {
    const before = { cleanSales: 70, days: 7, keep: 30 }
    const after = { cleanSales: 77, days: 7, keep: 33 } // +21% raw
    // Every other product also rose 25%: the step itself did nothing much.
    const adjusted = judgeStep({ before, after, catalogueRatio: 1.25 })
    expect(adjusted.verdict).toBe('TOO_EARLY')
    expect(adjusted.change).toBeCloseTo((77 * 33) / 7 / 1.25 / 300 - 1, 10)
    expect(judgeStep({ before, after }).verdict).toBe('KEEP')
  })

  it('a step started between the two fixture weeks is judged on them, and C7 fires', async () => {
    const [kurti] = await fixtureProducts()
    await upload('SAMPLE_SYNTHETIC_PAYMENT_FILE_week1.xlsx', 1000)
    await startPriceStep(kurti!.id, 310, db, Date.parse('2026-10-05T08:00:00'))
    const step = (await db.priceSteps.toArray())[0]!
    expect(stepReports(step, kurti!.sku, await db.skuStats.toArray(), await db.reports.toArray()).after).toBeNull()

    await upload('SAMPLE_SYNTHETIC_PAYMENT_FILE_week2.xlsx', 2000)
    const rows = await db.skuStats.toArray()
    const reports = await db.reports.toArray()
    const { before, after } = stepReports(step, kurti!.sku, rows, reports)
    expect(before!.report.periodFrom).toBe('2026-09-28')
    expect(after!.report.periodFrom).toBe('2026-10-05')
    const j = judgeProductStep({ step, sku: kurti!.sku, base: keepInputFor(kurti!, shop), rows, reports })
    // Week 2 returns jumped 16% → 23%: profit per day fell well over 10%.
    expect(j.verdict).toBe('GO_BACK')
    const c7 = (await checksNow()).filter((c) => c.rule === 'C7')
    expect(c7).toMatchObject([{ productId: kurti!.id, payload: { verdict: 'GO_BACK', from: 1, to: 310 } }])

    // Going back restores the old price and closes the step.
    await closePriceStep(step.id, 'GO_BACK', db)
    expect((await db.products.get(kurti!.id))!.price).toBe(1)
    expect((await checksNow()).filter((c) => c.rule === 'C7')).toEqual([])
  })
})

// ------------------------------------------------------- events, referral

describe('events, team exclusion and referral (Section 10; Section 15 test 11, negative 12)', () => {
  it('the share link carries this device\'s referral code (test 11)', async () => {
    const code = await referralCode(db)
    expect(code).toMatch(REF_PATTERN)
    expect(await referralCode(db)).toBe(code)
    const url = shareUrl('https://sahi-daam.example/', code)
    expect(url).toBe(`https://sahi-daam.example/?ref=${code}`)
    expect(decodeURIComponent(whatsappLink(`Try it: ${url}`))).toContain(`?ref=${code}`)
  })

  it('?team=1 tags every event this device sends (negative 12, client side)', async () => {
    await readLaunchParams('?team=1', db)
    await track('report_uploaded', { products: 5 }, db)
    const [row] = await db.outbox.toArray()
    expect(row!.payload).toMatchObject({ name: 'report_uploaded', team: true, props: { products: 5 } })
  })

  it('remembers a valid ?ref code once, and ignores junk', async () => {
    await readLaunchParams('?ref=abc', db)
    expect(await db.kv.get('referredBy')).toBeUndefined()
    await readLaunchParams('?ref=XK7P2Q', db)
    await readLaunchParams('?ref=ZZZZZZ', db)
    expect((await db.kv.get('referredBy'))!.value).toBe('XK7P2Q')
  })

  it('once-only, daily and the 200-a-day cap', async () => {
    expect(await track('onboarding_done', {}, db)).toBe(true)
    expect(await track('onboarding_done', {}, db)).toBe(false)
    expect(await track('leak_found', { losing: 2 }, db, OCT_20)).toBe(true)
    expect(await track('leak_found', { losing: 2 }, db, OCT_20 + 3600_000)).toBe(false)
    for (let i = 0; i < DAILY_EVENT_CAP + 5; i++) await track('share_clicked', {}, db, OCT_20)
    expect(await db.outbox.count()).toBe(DAILY_EVENT_CAP)
  })

  it('props carry only numbers, booleans and short codes', () => {
    expect(cleanProps({ products: 5, ok: true, ref: 'XK7P2Q', name: 'Blue Rayon Kurti', price: 299.999, Bad: 1 })).toEqual({
      products: 5,
      ok: true,
      ref: 'XK7P2Q',
      price: 300,
    })
  })

  it('without a backend nothing is sent; with one, sent rows leave the queue', async () => {
    await track('report_uploaded', { products: 5 }, db)
    expect(await flush(db, null)).toBe(0)
    expect(await db.outbox.count()).toBe(1)

    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 201 }))
    expect(await flush(db, { url: 'https://x.supabase.co', anonKey: 'anon' }, fetchFn)).toBe(1)
    expect(fetchFn).toHaveBeenCalledWith('https://x.supabase.co/rest/v1/events', expect.objectContaining({ method: 'POST' }))
    expect(await db.outbox.count()).toBe(0)
  })

  it('offline: kept for later', async () => {
    await track('report_uploaded', {}, db)
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await flush(db, { url: 'https://x.supabase.co', anonKey: 'anon' }, fetchFn)).toBe(0)
    expect(await db.outbox.count()).toBe(1)
  })
})

// --------------------------------------------------- backup, delete, .ics

describe('backup, restore and delete everything (7.11; Section 15, negative 11)', () => {
  it('a backup restores the seller\'s data exactly, and refuses other files', async () => {
    await saveShop({ language: 'hi', onboardedAt: 5 }, db)
    await fixtureProducts()
    await upload('SAMPLE_SYNTHETIC_PAYMENT_FILE_week1.xlsx', 1000)
    const backup = JSON.parse(JSON.stringify(await exportBackup(db)))
    expect(backup.app).toBe(BACKUP_APP)

    await deleteEverything(db)
    for (const t of db.tables) expect(await t.count(), t.name).toBe(0)

    const parsed = parseBackup(JSON.stringify(backup), db.verno)
    if (typeof parsed === 'string') throw new Error(parsed)
    await restoreBackup(parsed, db)
    expect(await db.products.count()).toBe(3)
    expect(await db.skuStats.count()).toBe(5)
    expect((await db.shop.get('main'))!.language).toBe('hi')

    expect(parseBackup('not json', db.verno)).toBe('notBackup')
    expect(parseBackup(JSON.stringify({ app: 'other' }), db.verno)).toBe('notBackup')
    expect(parseBackup(JSON.stringify({ ...backup, schema: 99 }), db.verno)).toBe('newerSchema')
  })

  it('delete everything leaves every table empty, the device id and queue included', async () => {
    await saveShop({ language: 'en', onboardedAt: 5 }, db)
    await fixtureProducts()
    await track('onboarding_done', {}, db)
    await deleteEverything(db)
    for (const t of db.tables) expect(await t.count(), t.name).toBe(0)
  })
})

describe('"Remind me every Monday" (.ics)', () => {
  it('next Monday at 10:00', () => {
    expect(nextMonday(new Date(2026, 9, 20, 15, 0)).toString()).toBe(new Date(2026, 9, 26, 10, 0).toString()) // Tue → Mon 26
    expect(nextMonday(new Date(2026, 9, 26, 9, 0)).getDate()).toBe(26) // Monday before 10
    expect(nextMonday(new Date(2026, 9, 26, 11, 0)).getDate()).toBe(2) // Monday after 10 → next week
  })

  it('is a weekly Monday event with a link back to the app, CRLF and folded', () => {
    const ics = mondayReminderIcs({ appUrl: 'https://sahi-daam.example/checks', title: 'Sahi Daam: upload this week’s Meesho report', description: 'See what changed, in 2 minutes.', now: new Date(2026, 9, 20, 15), uid: 'u1' })
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO')
    expect(ics).toContain('DTSTART:20261026T100000')
    expect(ics).toContain('URL:https://sahi-daam.example/checks')
    expect(ics).toContain('BEGIN:VALARM')
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
  })
})
