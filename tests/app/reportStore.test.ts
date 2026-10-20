import 'fake-indexeddb/auto'

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type Product, SahiDaamDb } from '../../src/app/db'
import { DAYS_PER_MONTH, compareWorstFirst, leakFinder, linkFor, summarise } from '../../src/app/lib/products'
import { sha256HexSync } from '../../src/app/report/hash'
import {
  addFromReport,
  findDuplicate,
  latestBySku,
  removeReport,
  restoreReport,
  saveReport,
} from '../../src/app/report/store'
import { addProduct, newShop, type ProductInput } from '../../src/app/repo'
import { keepPerSale } from '../../src/engine/keep'
import { SYNTHETIC_DIR, loadReport, loadWorkbook } from '../fixtures/reports/loadReport'

const W1 = join(SYNTHETIC_DIR, 'SAMPLE_SYNTHETIC_PAYMENT_FILE_week1.xlsx')
const W2 = join(SYNTHETIC_DIR, 'SAMPLE_SYNTHETIC_PAYMENT_FILE_week2.xlsx')
const shop = newShop('en', 0)

let db: SahiDaamDb

beforeEach(async () => {
  db = new SahiDaamDb(`t-${Math.random().toString(36).slice(2)}`)
  await db.open()
  vi.stubGlobal('navigator', {})
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await db.delete()
})

async function upload(path: string, now = Date.now()) {
  const { analysis, data } = loadReport(path)
  return saveReport(
    {
      fileName: path.split(/[\\/]/).pop()!,
      fileHash: sha256HexSync(new Uint8Array(readFileSync(path))),
      data,
      mappingId: 'auto',
      synthetic: analysis.synthetic,
    },
    db,
    now,
  )
}

/** The seller's own products, from sku_costs_SAMPLE.csv (cost, weight). */
async function addFixtureProducts(): Promise<Product[]> {
  const costs = Object.values(loadWorkbook(join(SYNTHETIC_DIR, 'sku_costs_SAMPLE.csv')))[0]!
  const out: Product[] = []
  for (const c of costs) {
    const sku = String(c['Supplier SKU'])
    const input: ProductInput = {
      name: String(c['Product Name']),
      sku: sku.toLowerCase(), // matching is case-insensitive
      category: sku.startsWith('JHUMKA') ? 'jewellery' : 'ethnic_women',
      cost: Number(c['Cost Price']),
      weightG: Number(c['Packed Weight (g)']),
      price: 1,
    }
    out.push(await addProduct(input, db))
  }
  return out
}

async function links() {
  return latestBySku(await db.skuStats.toArray(), await db.reports.toArray())
}

describe('saving a report', () => {
  it('stores the report and one totals row per product, nothing else', async () => {
    const report = await upload(W1, 1000)
    expect(report).toMatchObject({
      fileName: 'SAMPLE_SYNTHETIC_PAYMENT_FILE_week1.xlsx',
      periodFrom: '2026-09-28',
      periodTo: '2026-10-04',
      periodDays: 7,
      orderLines: 459,
      productCount: 5,
      synthetic: true,
      adsSplitByOrders: true,
      uploadedAt: 1000,
    })
    const rows = await db.skuStats.toArray()
    expect(rows).toHaveLength(5)
    const kurti = rows.find((r) => r.sku === 'KURTI-BLUE-01')!
    expect(kurti).toMatchObject({
      productName: 'Blue Rayon Kurti',
      orders: 120,
      delivered: 100,
      deliveredKept: 84,
      rto: 20,
      returns: 16,
      cancelled: 2,
      avgPrice: 300,
      avgShip: 59,
      forwardChargedOnRto: false,
      productId: '',
    })
    expect(kurti.avgReturnShip).toBeCloseTo(141.6, 6)
    expect(kurti.ads).toBeCloseTo(480, 6)
    expect(kurti.penalties).toBeCloseTo(-141.6, 6)
    expect(kurti.netSettlement).toBeCloseTo(16889.08, 2)
  })

  it('links rows to products with the same SKU, ignoring case', async () => {
    const products = await addFixtureProducts()
    await upload(W1)
    const kurti = products.find((p) => p.sku === 'kurti-blue-01')!
    expect((await db.skuStats.where('productId').equals(kurti.id).toArray())[0]!.sku).toBe('KURTI-BLUE-01')
  })
})

describe('duplicates (Section 15, negative 8)', () => {
  it('finds the same file by its hash, and the database refuses it twice', async () => {
    const first = await upload(W1, 1000)
    const hash = sha256HexSync(new Uint8Array(readFileSync(W1)))
    expect((await findDuplicate(hash, db))!.id).toBe(first.id)
    expect(await findDuplicate(sha256HexSync(new Uint8Array(readFileSync(W2))), db)).toBeUndefined()
    await expect(upload(W1, 2000)).rejects.toThrow()
    expect(await db.reports.count()).toBe(1)
    expect(await db.skuStats.count()).toBe(5)
  })
})

describe('personal data is never stored (Section 15, negative 9)', () => {
  it('no buyer names, no sub-order ids, no order lines anywhere in the database', async () => {
    await upload(W1)
    await upload(join(SYNTHETIC_DIR, 'SAMPLE_SYNTHETIC_PAYMENT_FILE_week2_order_payments.csv'))
    const everything: Record<string, unknown[]> = {}
    for (const table of db.tables) everything[table.name] = await table.toArray()
    const dump = JSON.stringify(everything)
    expect(dump).not.toMatch(/TEST BUYER/)
    expect(dump).not.toMatch(/Customer Name/)
    expect(dump).not.toMatch(/SYN1000/)
    expect(everything.skuStats).toHaveLength(10)
  })
})

describe('Me → Reports → Remove (spec 8.2)', () => {
  it('removes the report and its totals, and Undo restores both', async () => {
    const report = await upload(W1)
    const removed = await removeReport(report.id, db)
    expect(await db.reports.count()).toBe(0)
    expect(await db.skuStats.count()).toBe(0)
    await restoreReport(removed!, db)
    expect(await db.reports.count()).toBe(1)
    expect(await db.skuStats.count()).toBe(5)
  })
})

describe('unmatched products: quick cost entry (7.3)', () => {
  it('creates each product with its cost and the report price, and links the rows', async () => {
    await upload(W1)
    const ids = await addFromReport(
      [
        { sku: 'KURTI-BLUE-01', name: 'Blue Rayon Kurti', cost: 150, price: 300 },
        { sku: 'JHUMKA-04', name: 'Oxidised Jhumka Earrings', price: 149 }, // no cost typed: skipped
      ],
      shop,
      db,
    )
    expect(ids).toHaveLength(1)
    const p = (await db.products.get(ids[0]!))!
    expect(p).toMatchObject({ name: 'Blue Rayon Kurti', sku: 'KURTI-BLUE-01', cost: 150, price: 300, weightG: 350, category: 'ethnic_women' })
    expect((await db.skuStats.where('productId').equals(p.id).count())).toBe(1)
  })

  it('can link a SKU to a product the seller typed in by hand instead', async () => {
    const typed = await addProduct({ name: 'My kurti', category: 'ethnic_women', cost: 150, weightG: 350, price: 300 }, db)
    await upload(W1)
    await addFromReport([{ sku: 'KURTI-BLUE-01', name: 'Blue Rayon Kurti', price: 300, linkTo: typed.id }], shop, db)
    expect((await db.products.get(typed.id))!.sku).toBe('KURTI-BLUE-01')
    expect(await db.products.count()).toBe(1)
  })
})

describe('the latest report wins', () => {
  it('week 2 replaces week 1 for every SKU', async () => {
    await upload(W1, 1000)
    await upload(W2, 2000)
    const l = await links()
    expect(l.get('KURTI-BLUE-01')!.report.periodFrom).toBe('2026-10-05')
    expect(l.get('KURTI-BLUE-01')!.row.returns).toBe(23)
  })
})

describe('reconciliation on the fixtures (Section 15, positive 3)', () => {
  it.each([W1, W2, join(SYNTHETIC_DIR, 'SAMPLE_SYNTHETIC_PAYMENT_FILE_week1_order_payments.csv')])(
    '%s: every product matches within ±5%',
    async (file) => {
      const products = await addFixtureProducts()
      await upload(file)
      const l = await links()
      for (const p of products) {
        const s = summarise(p, shop, linkFor(p, l))
        expect(s.report, p.name).not.toBeNull()
        expect(s.report!.reconciliation.status, p.name).toBe('MATCHES')
        expect(Math.abs(s.report!.reconciliation.differencePct), p.name).toBeLessThanOrEqual(0.05)
      }
    },
  )

  it('a report with a different fee (₹30 more shipping) differs and names shipping', async () => {
    const products = await addFixtureProducts()
    const { analysis, data } = loadReport(W1)
    const kurti = data.stats.get('KURTI-BLUE-01')!
    data.stats.set('KURTI-BLUE-01', {
      ...kurti,
      avgShipInclGst: kurti.avgShipInclGst! + 30,
      avgSettlementPerDelivered: kurti.avgSettlementPerDelivered! - 30,
    })
    await saveReport({ fileName: 'x.xlsx', fileHash: 'perturbed', data, mappingId: 'auto', synthetic: analysis.synthetic }, db)
    const p = products.find((x) => x.sku === 'kurti-blue-01')!
    const s = summarise(p, shop, linkFor(p, await links()))
    expect(s.report!.reconciliation.status).toBe('DIFFERS')
    expect(s.report!.reconciliation.gapLines[0]!.field).toBe('fwdPerDelivered')
    // And the report's own number is used from here on.
    expect(s.input.fwdPerDelivered).toBeCloseTo(89 / 1.18, 6)
  })
})

describe('leak finder from report data (Section 15, positive 4)', () => {
  it('uses report numbers, ranks worst first and totals the monthly loss', async () => {
    const products = await addFixtureProducts()
    await upload(W1)
    const lf = leakFinder(products, shop, await links())

    expect(lf.basis).toBe('report')
    expect(lf.rows.every((r) => !r.estimated && r.monthlySource === 'report')).toBe(true)
    for (let i = 1; i < lf.rows.length; i++) expect(compareWorstFirst(lf.rows[i - 1]!, lf.rows[i]!)).toBeLessThanOrEqual(0)

    // Monthly = the report's clean sales scaled from 7 days to a month × keep.
    const kurti = lf.rows.find((r) => r.product.sku === 'kurti-blue-01')!
    expect(kurti.monthly).toBeCloseTo(((84 * DAYS_PER_MONTH) / 7) * kurti.result.keep, 6)
    expect(kurti.input.price).toBe(300)
    expect(kurti.input.rtoRate).toBeCloseTo(20 / 120, 10)
    expect(kurti.input.returnRate).toBeCloseTo(0.16, 10)
    expect(kurti.input.adPerOrder).toBeCloseTo(480 / 120, 10)

    const losing = lf.rows.filter((r) => r.monthly! < 0)
    expect(lf.losingCount).toBe(losing.length)
    expect(lf.monthlyLoss).toBeCloseTo(-losing.reduce((a, r) => a + r.monthly!, 0), 6)
  })

  it('products not in any report keep their estimates', async () => {
    const typed = await addProduct({ name: 'Not in report', category: 'ethnic_women', cost: 150, weightG: 350, price: 300, ordersPerWeek: 10 }, db)
    await upload(W1)
    const lf = leakFinder([typed], shop, await links())
    expect(lf.rows[0]!.estimated).toBe(true)
    expect(lf.rows[0]!.monthlySource).toBe('typed')
  })
})

describe('TCS / TDS present → keep unchanged (Section 15, negative 10)', () => {
  it('keep is the same whether or not the report carries TCS / TDS', async () => {
    const products = await addFixtureProducts()
    const withTax = loadReport(W1)
    const noTax = loadReport(W1)
    const { tcs: _tcs, tds: _tds, ...cols } = noTax.analysis.columns
    const { buildReport } = await import('../../src/app/report/extract')
    const dataNoTax = buildReport(noTax.analysis, cols)

    await saveReport({ fileName: 'a', fileHash: 'a', data: withTax.data, mappingId: 'auto', synthetic: true }, db, 1000)
    const p = products.find((x) => x.sku === 'kurti-blue-01')!
    const a = summarise(p, shop, linkFor(p, await links()))
    await db.reports.clear()
    await db.skuStats.clear()
    await saveReport({ fileName: 'b', fileHash: 'b', data: dataNoTax, mappingId: 'auto', synthetic: true }, db, 2000)
    const b = summarise(p, shop, linkFor(p, await links()))

    expect(a.input.tcsTdsPerDelivered).toBeGreaterThan(0)
    expect(b.input.tcsTdsPerDelivered).toBe(0)
    expect(a.result.keep).toBeCloseTo(b.result.keep, 10)
    expect(a.result.floor).toBeCloseTo(b.result.floor, 10)
    expect(keepPerSale(a.input).taxDeductedClaimable).toBeGreaterThan(0)
  })
})
