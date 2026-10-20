/**
 * Which lifecycle stage a product is in (spec v2, 7.6): auto-set from how
 * long it has been listed and its order trend, and always editable.
 *
 *   under 30 days                         Launch
 *   30–90 days                            Growing
 *   over 90 days                          Steady
 *   over 90 days and orders down ≥ 30%    Clearing
 *
 * "Listed since" is the earliest of what the seller typed, when the product
 * was added, and the start of its first report, so a product created today
 * from a report full of orders isn't called a launch.
 */
import type { Stage } from '../../engine/priceHelper'
import type { Product, Report, SkuStatsRow } from '../db'
import { normSku } from '../report/store'

const DAY = 86_400_000
export const LAUNCH_DAYS = 30
export const GROWING_DAYS = 90
/** Orders per day down this much between the last two reports → clearing. */
export const FALLING_TREND = -0.3

/** Orders per day in the latest report vs the one before, as a change (−0.3 = down 30%); null without two dated reports. */
export function orderTrend(sku: string | undefined, rows: SkuStatsRow[], reports: Report[]): number | null {
  if (!sku) return null
  const byId = new Map(reports.map((r) => [r.id, r]))
  const dated = rows
    .filter((r) => normSku(r.sku) === normSku(sku))
    .map((r) => ({ row: r, report: byId.get(r.reportId) }))
    .filter((x): x is { row: SkuStatsRow; report: Report } => Boolean(x.report?.periodTo && x.report.periodDays))
    .sort((a, b) => (a.report.periodTo! < b.report.periodTo! ? -1 : 1))
  if (dated.length < 2) return null
  const rate = (x: (typeof dated)[number]) => x.row.orders / x.report.periodDays!
  const prev = rate(dated[dated.length - 2]!)
  const last = rate(dated[dated.length - 1]!)
  return prev > 0 ? last / prev - 1 : null
}

export function listedSince(product: Product, rows: SkuStatsRow[], reports: Report[]): number {
  const candidates = [product.createdAt]
  if (product.listedSince) candidates.push(Date.parse(`${product.listedSince}T00:00:00`))
  if (product.sku) {
    const byId = new Map(reports.map((r) => [r.id, r]))
    for (const row of rows) {
      const from = byId.get(row.reportId)?.periodFrom
      if (normSku(row.sku) === normSku(product.sku) && from) candidates.push(Date.parse(`${from}T00:00:00`))
    }
  }
  return Math.min(...candidates.filter(Number.isFinite))
}

export function autoStage(args: { since: number; trend: number | null; now?: number }): Stage {
  const days = ((args.now ?? Date.now()) - args.since) / DAY
  if (days > GROWING_DAYS && args.trend !== null && args.trend <= FALLING_TREND) return 'CLEARING'
  if (days < LAUNCH_DAYS) return 'LAUNCH'
  if (days < GROWING_DAYS) return 'GROWING'
  return 'STEADY'
}
