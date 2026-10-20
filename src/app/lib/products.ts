/**
 * A saved product + the shop setup → engine v2 input, result, status, and the
 * profit leak finder (MVP spec v2, 7.4–7.5). Pure, no React.
 */
import { rates } from '../../data/rates'
import {
  type KeepField,
  type KeepInput,
  type KeepResult,
  defaultKeepInput,
  keepPerSale,
} from '../../engine/keep'
import { type Reconciliation, reconcileReport } from '../../engine/report'
import type { Product, Shop } from '../db'
import { type ReportLink, normSku, toEngineStats } from '../report/store'

export type Status = 'LOSS' | 'THIN' | 'HEALTHY'

/** Below a 10% margin over the floor a product is "Thin" (same line as the prototype). */
export const THIN_MARGIN = 0.1

/** Weeks in a month, for turning orders a week into a monthly figure. */
export const WEEKS_PER_MONTH = 52 / 12

type ShopSetup = Pick<Shop, 'gstRegistered' | 'gstRate' | 'buyerRegion' | 'prepaidDiscount'>

export function keepInputFor(product: Product, shop: ShopSetup): KeepInput {
  const feeGst = 1 + rates.feeGstRate
  // What the seller typed. Panel charges include GST; the engine works before GST.
  const entered: Partial<KeepInput> = { price: product.price, cost: product.cost }
  if (product.ship !== undefined) entered.fwdPerDelivered = product.ship / feeGst
  if (product.returnShip !== undefined) entered.revPerReturn = product.returnShip / feeGst
  if (product.packaging !== undefined) entered.packagingPerOrder = product.packaging
  if (product.adPerOrder !== undefined) entered.adPerOrder = product.adPerOrder
  if (shop.gstRate !== null) entered.outputGstRate = shop.gstRate

  return defaultKeepInput(
    product.category,
    { ...entered, weightG: product.weightG },
    {
      gstRegistered: shop.gstRegistered,
      buyerRegion: shop.buyerRegion,
      prepaidDiscount: shop.prepaidDiscount,
    },
  )
}

export function statusOf(result: KeepResult, price: number): Status {
  if (!result.viable || result.keep < 0) return 'LOSS'
  if (price <= 0 || (price - result.floor) / price < THIN_MARGIN) return 'THIN'
  return 'HEALTHY'
}

export interface ProductSummary {
  product: Product
  input: KeepInput
  result: KeepResult
  status: Status
  /** ₹ a month, or null when no order count was entered. */
  monthly: number | null
  /** True until a report supplies this product's numbers. */
  estimated: boolean
  /** Where the monthly figure came from. */
  monthlySource: 'report' | 'typed' | null
  /** The latest report for this product's SKU, and how it reconciled. */
  report: (ReportLink & { reconciliation: Reconciliation }) | null
}

/** The inputs that drive the answer most, for "estimated" chips. */
export const CHIP_FIELDS = [
  'fwdPerDelivered',
  'revPerReturn',
  'rtoRate',
  'returnRate',
  'unsellableShare',
  'packagingPerOrder',
  'adPerOrder',
  'outputGstRate',
] as const satisfies readonly KeepField[]

export type ChipField = (typeof CHIP_FIELDS)[number]

/** Average days in a month, for turning a report period into a monthly figure. */
export const DAYS_PER_MONTH = 365.25 / 12

/**
 * One product's answer. With a report for its SKU, the report's numbers
 * replace the estimates (hard rule 1) and the monthly figure comes from the
 * report's own clean sales; otherwise from the orders a week the seller typed.
 */
export function summarise(product: Product, shop: ShopSetup, link?: ReportLink | null): ProductSummary {
  const base = keepInputFor(product, shop)
  let input = base
  let report: ProductSummary['report'] = null
  let cleanSalesPerMonth: number | undefined
  let monthlySource: ProductSummary['monthlySource'] = null

  if (link) {
    const reconciliation = reconcileReport(base, toEngineStats(link.row), {
      adsTotal: link.row.ads ?? undefined,
      penaltiesTotal: link.row.penalties ?? undefined,
    })
    input = reconciliation.calibrated
    // The seller's own price wins if they set it after this report arrived (e.g. "Use this price").
    if (product.priceSetAt !== undefined && product.priceSetAt > link.report.uploadedAt) {
      input = { ...input, price: product.price, sources: { ...input.sources, price: 'YOU_ENTERED' } }
    }
    report = { ...link, reconciliation }
    if (link.report.periodDays) {
      cleanSalesPerMonth = (link.row.deliveredKept * DAYS_PER_MONTH) / link.report.periodDays
      monthlySource = 'report'
    }
  }
  if (cleanSalesPerMonth === undefined && product.ordersPerWeek !== undefined) {
    // Orders dispatched a month × the share that become clean sales.
    cleanSalesPerMonth = product.ordersPerWeek * WEEKS_PER_MONTH * (1 - input.rtoRate) * (1 - input.returnRate)
    monthlySource = 'typed'
  }

  const result = keepPerSale({ ...input, cleanSalesPerMonth })
  return {
    product,
    input,
    result,
    status: statusOf(result, input.price),
    monthly: result.monthly,
    estimated: report === null,
    monthlySource,
    report,
  }
}

/** The report link for a product, by SKU. */
export function linkFor(product: Product, links: Map<string, ReportLink>): ReportLink | null {
  return product.sku ? (links.get(normSku(product.sku)) ?? null) : null
}

const STATUS_RANK: Record<Status, number> = { LOSS: 0, THIN: 1, HEALTHY: 2 }

/** Worst first: losses, then thin, then healthy; within each, most money lost a month first. */
export function compareWorstFirst(a: ProductSummary, b: ProductSummary): number {
  const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status]
  if (byStatus !== 0) return byStatus
  if (a.monthly !== null && b.monthly !== null && a.monthly !== b.monthly) return a.monthly - b.monthly
  if (a.monthly !== null && b.monthly === null) return -1
  if (a.monthly === null && b.monthly !== null) return 1
  return a.result.keep - b.result.keep
}

export interface LeakFinder {
  rows: ProductSummary[]
  /** Products with an order count that lose money every month. */
  losingCount: number
  /** Total lost a month by those products, ₹ (positive). */
  monthlyLoss: number
  /** False when no product has an order count: the top card is hidden. */
  hasOrderCounts: boolean
  /** Where the monthly figures came from, for the line under the top card. */
  basis: 'report' | 'typed' | 'mixed' | null
}

export function leakFinder(
  products: Product[],
  shop: ShopSetup,
  links: Map<string, ReportLink> = new Map(),
): LeakFinder {
  const rows = products.map((p) => summarise(p, shop, linkFor(p, links))).sort(compareWorstFirst)
  const losing = rows.filter((r) => r.monthly !== null && r.monthly < 0)
  const sources = new Set(rows.map((r) => r.monthlySource).filter((s) => s !== null))
  return {
    rows,
    losingCount: losing.length,
    monthlyLoss: -losing.reduce((sum, r) => sum + r.monthly!, 0),
    hasOrderCounts: rows.some((r) => r.monthly !== null),
    basis: sources.size === 0 ? null : sources.size > 1 ? 'mixed' : [...sources][0]!,
  }
}

/** How many products change status when the shop setup changes (spec 8.2 toast). */
export function statusChanges(
  products: Product[],
  before: ShopSetup,
  after: ShopSetup,
  links: Map<string, ReportLink> = new Map(),
): number {
  return products.filter(
    (p) => summarise(p, before, linkFor(p, links)).status !== summarise(p, after, linkFor(p, links)).status,
  ).length
}

export type LeakFilter = 'ALL' | 'LOSS' | 'THIN'

export function filterRows(rows: ProductSummary[], filter: LeakFilter, query: string): ProductSummary[] {
  const q = query.trim().toLowerCase()
  return rows.filter(
    (r) =>
      (filter === 'ALL' || r.status === filter) &&
      (q === '' || r.product.name.toLowerCase().includes(q)),
  )
}

/** Search appears once the list is longer than this (spec 7.5). */
export const SEARCH_AFTER = 8
