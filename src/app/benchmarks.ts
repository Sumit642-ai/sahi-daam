/**
 * Opt-in anonymous sharing (spec v2, section 9): off by default. When on,
 * each product's report rates are queued as one row of category, buyer
 * region bucket, RTO %, return % and average shipping. No product names,
 * prices, costs, SKUs or ids, and nothing from products with under 20
 * orders (too few to be a fair benchmark, and easier to recognise).
 */
import { LOW_DATA_ORDERS } from '../engine/report'
import { type SahiDaamDb, db as appDb } from './db'
import { normSku, toEngineStats } from './report/store'
import { enqueue } from './telemetry'

export async function queueBenchmarks(reportId: string | null, db: SahiDaamDb = appDb): Promise<number> {
  const shop = await db.shop.get('main')
  if (!shop?.shareOptIn) return 0
  const products = await db.products.toArray()
  const rows = reportId ? await db.skuStats.where('reportId').equals(reportId).toArray() : await db.skuStats.toArray()
  let n = 0
  for (const row of rows) {
    if (row.orders < LOW_DATA_ORDERS) continue
    const s = toEngineStats(row)
    const product = products.find((p) => p.sku && normSku(p.sku) === normSku(row.sku))
    await enqueue(
      'benchmark',
      {
        category: product?.category ?? shop.category,
        region: shop.buyerRegion,
        rto_pct: Math.round(s.rtoRate * 1000) / 10,
        return_pct: Math.round(s.returnRate * 1000) / 10,
        avg_ship: row.avgShip === null ? null : Math.round(row.avgShip * 100) / 100,
      },
      db,
    )
    n++
  }
  return n
}
