/**
 * Weekly checks C1–C7 (spec v2, 7.8). Pure: computes what should be shown
 * right now; `syncChecks` (in repo) writes the difference.
 *
 * Each check has a key built from the rule, the product and the facts that
 * fired it (e.g. the two report ids for C2). That gives the dedupe rules:
 *   - one active check per (rule, product): a newer key replaces the old one
 *   - a dismissed check stays dismissed while its facts are the same
 *   - when the facts go away, the check closes itself
 */
import { market } from '../../engine/priceHelper'
import type { Competitor, PriceStep, Product, Report, Shop, SkuStatsRow } from '../db'
import { normSku, toEngineStats } from '../report/store'
import type { ProductSummary } from './products'

export type Rule = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7'

export interface CheckCandidate {
  key: string
  rule: Rule
  productId?: string
  payload: Record<string, number | string>
}

/** C2/C3 fire on a rise of this many points between consecutive reports. */
export const RISE_POINTS = 0.05
/** C4: product cost moved more than this. */
export const COST_CHANGE = 0.05
/** C5: market middle this far below your price. */
export const UNDERCUT = 0.08
/** C6: COD share at or above this in the festive window. */
export const COD_HEAVY = 0.6

/** 1 October – 15 November (inclusive), the festive run-up. */
export function inFestiveWindow(now: number): boolean {
  const d = new Date(now)
  const m = d.getMonth() + 1
  const day = d.getDate()
  return m === 10 || (m === 11 && day <= 15)
}

/** Each product's last two dated reports, oldest first. */
function lastTwo(sku: string | undefined, rows: SkuStatsRow[], byId: Map<string, Report>) {
  if (!sku) return null
  const dated = rows
    .filter((r) => normSku(r.sku) === normSku(sku))
    .map((row) => ({ row, report: byId.get(row.reportId)! }))
    .filter((x) => x.report)
    .sort((a, b) => {
      const ka = `${a.report.periodTo ?? ''}|${a.report.uploadedAt}`
      const kb = `${b.report.periodTo ?? ''}|${b.report.uploadedAt}`
      return ka < kb ? -1 : 1
    })
  return dated.length >= 2 ? ([dated[dated.length - 2]!, dated[dated.length - 1]!] as const) : null
}

const r1 = (x: number) => Math.round(x * 10) / 10

export function computeChecks(args: {
  products: Product[]
  summaries: Map<string, ProductSummary>
  rows: SkuStatsRow[]
  reports: Report[]
  competitor: Competitor[]
  steps: { step: PriceStep; verdict: string; change: number | null }[]
  shop: Shop
  now: number
}): CheckCandidate[] {
  const { products, summaries, rows, reports, competitor, steps, shop, now } = args
  const byId = new Map(reports.map((r) => [r.id, r]))
  const out: CheckCandidate[] = []

  for (const p of products) {
    const s = summaries.get(p.id)
    if (!s) continue
    const price = Math.round(s.input.price)

    // C1: price below floor.
    if (!s.result.viable || s.result.keep < 0) {
      const floor = Number.isFinite(s.result.floor) ? Math.ceil(s.result.floor) : 0
      out.push({ key: `C1:${p.id}:${price}:${floor}`, rule: 'C1', productId: p.id, payload: { price, floor } })
    }

    // C2 / C3: returns or RTO up ≥ 5 points between the last two reports.
    const two = lastTwo(p.sku, rows, byId)
    if (two) {
      const prev = toEngineStats(two[0].row)
      const last = toEngineStats(two[1].row)
      const pair = `${two[0].report.id}:${two[1].report.id}`
      if (last.returnRate - prev.returnRate >= RISE_POINTS - 1e-9) {
        out.push({ key: `C2:${p.id}:${pair}`, rule: 'C2', productId: p.id, payload: { from: r1(prev.returnRate * 100), to: r1(last.returnRate * 100) } })
      }
      if (last.rtoRate - prev.rtoRate >= RISE_POINTS - 1e-9) {
        out.push({ key: `C3:${p.id}:${pair}`, rule: 'C3', productId: p.id, payload: { from: r1(prev.rtoRate * 100), to: r1(last.rtoRate * 100) } })
      }
    }

    // C4: product cost changed by more than 5%.
    if (p.costChange && p.costChange.from > 0 && Math.abs(p.cost - p.costChange.from) / p.costChange.from > COST_CHANGE) {
      out.push({ key: `C4:${p.id}:${p.costChange.at}`, rule: 'C4', productId: p.id, payload: { from: p.costChange.from, to: p.cost } })
    }

    // C5: the market middle the seller entered is more than 8% below their price.
    const entered = competitor.find((c) => c.productId === p.id)
    if (entered && entered.prices.length > 0) {
      const m = market(entered.prices)
      if (m.used.length > 0 && m.median < price * (1 - UNDERCUT)) {
        const median = Math.round(m.median)
        out.push({ key: `C5:${p.id}:${median}:${price}`, rule: 'C5', productId: p.id, payload: { median, price, gap: Math.round((1 - m.median / price) * 100) } })
      }
    }
  }

  // C6: festive run-up and COD-heavy (shop setup: 80% COD, or 60% with a prepaid discount).
  const codShare = shop.prepaidDiscount ? 0.6 : 0.8
  if (inFestiveWindow(now) && codShare >= COD_HEAVY && products.length > 0) {
    out.push({ key: `C6:${new Date(now).getFullYear()}`, rule: 'C6', payload: { cod: Math.round(codShare * 100) } })
  }

  // C7: a price step has enough data to judge.
  for (const { step, verdict, change } of steps) {
    if (step.judgedAt || (verdict !== 'KEEP' && verdict !== 'GO_BACK')) continue
    out.push({
      key: `C7:${step.id}:${verdict}`,
      rule: 'C7',
      productId: step.productId,
      payload: { verdict, from: step.oldPrice, to: step.newPrice, change: change === null || !Number.isFinite(change) ? 0 : Math.round(change * 100) },
    })
  }
  return out
}
