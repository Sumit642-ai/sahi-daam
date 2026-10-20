/**
 * Saving reports on the phone (spec v2, 7.3 and section 9).
 *
 * Only the report's metadata and one totals row per product (skuStats) are
 * written. Order lines, buyer data and the file itself are never stored.
 */
import { categoryRates } from '../../data/rates'
import type { SkuStats } from '../../engine/report'
import { LOW_DATA_ORDERS } from '../../engine/report'
import { type Report, type SahiDaamDb, type Shop, type SkuStatsRow, db as appDb, newId } from '../db'
import { addProduct, requestPersistOnce } from '../repo'
import type { ReportData } from './extract'

/** SKUs match case- and space-insensitively. */
export function normSku(sku: string | undefined): string {
  return (sku ?? '').trim().toUpperCase()
}

export function findDuplicate(fileHash: string, db: SahiDaamDb = appDb): Promise<Report | undefined> {
  return db.reports.where('fileHash').equals(fileHash).first()
}

/** Remembers a column choice for this report layout (the id is the layout signature). */
export async function saveMapping(signature: string, columns: Record<string, string>, db: SahiDaamDb = appDb): Promise<void> {
  await db.mappings.put({ id: signature, columns })
}

export interface SaveReportArgs {
  fileName: string
  fileHash: string
  data: ReportData
  mappingId: string
  synthetic: boolean
}

export async function saveReport(args: SaveReportArgs, db: SahiDaamDb = appDb, now = Date.now()): Promise<Report> {
  const { data } = args
  const report: Report = {
    id: newId(),
    fileHash: args.fileHash,
    fileName: args.fileName,
    periodFrom: data.periodFrom ?? undefined,
    periodTo: data.periodTo ?? undefined,
    periodDays: data.periodDays,
    mappingId: args.mappingId,
    uploadedAt: now,
    orderLines: data.orderLines,
    productCount: data.stats.size,
    synthetic: args.synthetic,
    adsSplitByOrders: data.adsSplitByOrders,
  }

  await db.transaction('rw', db.reports, db.skuStats, db.products, async () => {
    const productBySku = new Map<string, string>()
    for (const p of await db.products.toArray()) if (p.sku) productBySku.set(normSku(p.sku), p.id)

    const rows: SkuStatsRow[] = [...data.stats.values()].map((s) => ({
      id: newId(),
      reportId: report.id,
      productId: productBySku.get(normSku(s.sku)) ?? '',
      sku: s.sku,
      productName: data.names.get(s.sku) ?? s.sku,
      orders: s.dispatched,
      delivered: s.delivered,
      deliveredKept: s.deliveredKept,
      rto: s.rto,
      returns: s.returns,
      cancelled: s.cancelled,
      avgPrice: s.avgPrice,
      avgShip: s.avgShipInclGst,
      avgReturnShip: s.avgReturnShipInclGst,
      forwardChargedOnRto: s.forwardChargedOnRto,
      ads: data.adsBySku ? (data.adsBySku.get(s.sku) ?? 0) : null,
      penalties: data.penaltiesBySku ? (data.penaltiesBySku.get(s.sku) ?? 0) : null,
      tcsTds: s.tcsTds,
      netSettlement: s.netSettlement,
      avgSettlement: s.avgSettlementPerDelivered,
    }))
    await db.reports.add(report)
    await db.skuStats.bulkAdd(rows)
  })
  await requestPersistOnce(db)
  return report
}

/** A saved totals row back into the engine's shape. */
export function toEngineStats(row: SkuStatsRow): SkuStats {
  return {
    sku: row.sku,
    rows: row.orders + row.cancelled,
    dispatched: row.orders,
    delivered: row.delivered,
    deliveredKept: row.deliveredKept,
    returns: row.returns,
    rto: row.rto,
    cancelled: row.cancelled,
    rtoRate: row.orders > 0 ? row.rto / row.orders : 0,
    returnRate: row.delivered > 0 ? row.returns / row.delivered : 0,
    netSettlement: row.netSettlement,
    tcsTds: row.tcsTds,
    avgPrice: row.avgPrice,
    avgShipInclGst: row.avgShip,
    avgReturnShipInclGst: row.avgReturnShip,
    forwardChargedOnRto: row.forwardChargedOnRto,
    avgSettlementPerDelivered: row.avgSettlement,
    lowData: row.orders < LOW_DATA_ORDERS,
  }
}

export interface ReportLink {
  row: SkuStatsRow
  report: Report
}

/** For each SKU, its totals from the most recent report (by period end, then upload time). */
export function latestBySku(rows: SkuStatsRow[], reports: Report[]): Map<string, ReportLink> {
  const reportById = new Map(reports.map((r) => [r.id, r]))
  const key = (r: Report) => `${r.periodTo ?? ''}|${String(r.uploadedAt).padStart(15, '0')}`
  const out = new Map<string, ReportLink>()
  for (const row of rows) {
    const report = reportById.get(row.reportId)
    if (!report) continue
    const sku = normSku(row.sku)
    const current = out.get(sku)
    if (!current || key(report) > key(current.report)) out.set(sku, { row, report })
  }
  return out
}

export interface RemovedReport {
  report: Report
  rows: SkuStatsRow[]
}

/** Me → Reports → Remove (spec 8.2): numbers fall back to estimates. */
export async function removeReport(id: string, db: SahiDaamDb = appDb): Promise<RemovedReport | null> {
  return db.transaction('rw', db.reports, db.skuStats, async () => {
    const report = await db.reports.get(id)
    if (!report) return null
    const rows = await db.skuStats.where('reportId').equals(id).toArray()
    await db.skuStats.where('reportId').equals(id).delete()
    await db.reports.delete(id)
    return { report, rows }
  })
}

export async function restoreReport(removed: RemovedReport, db: SahiDaamDb = appDb): Promise<void> {
  await db.transaction('rw', db.reports, db.skuStats, async () => {
    await db.reports.put(removed.report)
    await db.skuStats.bulkPut(removed.rows)
  })
}

export interface QuickEntry {
  sku: string
  name: string
  /** Typed cost; required unless linking. */
  cost?: number
  price: number
  /** Link the SKU to a product the seller already added instead of creating one. */
  linkTo?: string
}

/**
 * Unmatched products from a report (spec 7.3): create each with its typed
 * cost, or link its SKU to an existing product. Weight starts at the
 * category default; the report's own shipping charges are used anyway.
 */
export async function addFromReport(entries: QuickEntry[], shop: Shop, db: SahiDaamDb = appDb): Promise<string[]> {
  const ids: string[] = []
  for (const e of entries) {
    let productId: string
    if (e.linkTo) {
      await db.products.update(e.linkTo, { sku: e.sku, updatedAt: Date.now() })
      productId = e.linkTo
    } else {
      if (e.cost === undefined) continue
      const p = await addProduct(
        {
          name: e.name,
          sku: e.sku,
          category: shop.category,
          cost: e.cost,
          price: e.price,
          weightG: categoryRates(shop.category).weightG,
        },
        db,
      )
      productId = p.id
    }
    const rows = await db.skuStats.toArray()
    await db.skuStats.bulkPut(rows.filter((r) => normSku(r.sku) === normSku(e.sku)).map((r) => ({ ...r, productId })))
    ids.push(productId)
  }
  return ids
}
