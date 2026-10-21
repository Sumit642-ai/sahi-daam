/**
 * Report calibration and reconciliation (MVP spec v2, 6.3).
 *
 * Input is order rows that have already been mapped to fields — finding the
 * right column in a real Meesho file is the upload screen's job (Phase B).
 * From those rows this file:
 *
 *   1. totals each SKU: dispatched, delivered, RTO, returns, settlement,
 *      average shipping and return charges, TCS / TDS
 *   2. reconciles: the model's expected payout per delivered order against
 *      the report's actual average. Within ±5% → "matches"; otherwise we say
 *      by how much, and which inputs explain the gap
 *   3. calibrates: puts the report's own numbers into the KeepInput (hard
 *      rule 1 — the seller's data beats our assumptions), tagged FROM_REPORT
 *
 * TCS and TDS are tax deducted and claimable. They are added back before the
 * comparison and never counted as a cost.
 *
 * Pure, framework-free. No React imports.
 */
import { rates } from '../data/rates'
import { type InputSource, type KeepField, type KeepInput } from './keep'

// -------------------------------------------------------------------- rows

export type OrderStatus = 'DELIVERED' | 'RETURN' | 'RTO' | 'CANCELLED' | 'OTHER'

/** One order line, mapped from whatever the report calls its columns. */
export interface OrderRow {
  sku: string
  /** The report's own status text, e.g. "Delivered", "RTO", "Return". */
  status: string
  quantity?: number
  /** Listed price incl. GST, ₹. */
  listingPrice?: number
  /** Forward shipping incl. GST, ₹; the report shows it negative. */
  shipping?: number
  /** Return shipping incl. GST, ₹; negative. */
  returnShipping?: number
  /** Negative. */
  tcs?: number
  /** Negative. */
  tds?: number
  /** What the seller was paid for this line, ₹; negative on returns. */
  settlement: number
}

/**
 * Reads a status by keyword, so "RTO Complete", "rto_complete" and "Return to
 * origin" all land on RTO. Orders still on their way ("Shipped", "In transit",
 * "Out for delivery") and failed or undelivered ones are OTHER: they are
 * checked before "deliver", so none of them ever counts as delivered.
 */
export function normaliseStatus(raw: string): OrderStatus {
  const s = raw.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  if (/\brto\b/.test(s) || s.includes('origin')) return 'RTO'
  if (s.includes('cancel')) return 'CANCELLED'
  if (s.includes('return')) return 'RETURN'
  if (/not delivered|undelivered|out for delivery|in transit|failed|shipped/.test(s)) return 'OTHER'
  if (s.includes('deliver')) return 'DELIVERED'
  return 'OTHER'
}

// ------------------------------------------------------------------ totals

/** Below this many dispatched orders a product is "Low data" (spec 6.3). */
export const LOW_DATA_ORDERS = 20

export interface SkuStats {
  sku: string
  rows: number
  /** Delivered + returned + RTO. Cancelled orders never shipped. */
  dispatched: number
  /** Reached the buyer: kept + returned (the model's D). */
  delivered: number
  deliveredKept: number
  returns: number
  rto: number
  cancelled: number
  rtoRate: number
  /** Returns ÷ delivered. */
  returnRate: number
  /** Sum of the settlement column, ₹. */
  netSettlement: number
  /** TCS + TDS deducted, as a positive ₹ amount. */
  tcsTds: number
  /** Average listed price over delivered orders, or null when absent. */
  avgPrice: number | null
  /** Forward shipping incl. GST per delivered order, ₹ (positive). */
  avgShipInclGst: number | null
  /** Return shipping incl. GST per customer return, ₹ (positive). */
  avgReturnShipInclGst: number | null
  /** True when any RTO line carries a forward-shipping charge. */
  forwardChargedOnRto: boolean
  /** (netSettlement + tcsTds) ÷ delivered: payout per delivered order before tax deducted. */
  avgSettlementPerDelivered: number | null
  lowData: boolean
}

export function summariseOrders(rows: OrderRow[]): Map<string, SkuStats> {
  const acc = new Map<
    string,
    {
      rows: number
      kept: number
      returns: number
      rto: number
      cancelled: number
      settlement: number
      tcsTds: number
      priceSum: number
      priceN: number
      ship: number
      returnShip: number
      shipOnRto: boolean
    }
  >()

  for (const row of rows) {
    const a = acc.get(row.sku) ?? {
      rows: 0,
      kept: 0,
      returns: 0,
      rto: 0,
      cancelled: 0,
      settlement: 0,
      tcsTds: 0,
      priceSum: 0,
      priceN: 0,
      ship: 0,
      returnShip: 0,
      shipOnRto: false,
    }
    const status = normaliseStatus(row.status)
    // Not final yet (or not a status we know): left out of every count and every rupee.
    if (status === 'OTHER') continue
    acc.set(row.sku, a)

    const qty = row.quantity ?? 1
    a.rows += 1
    a.settlement += row.settlement
    a.tcsTds += Math.abs(row.tcs ?? 0) + Math.abs(row.tds ?? 0)

    switch (status) {
      case 'DELIVERED':
      case 'RETURN':
        if (status === 'DELIVERED') a.kept += qty
        else a.returns += qty
        a.ship += Math.abs(row.shipping ?? 0)
        a.returnShip += Math.abs(row.returnShipping ?? 0)
        if (row.listingPrice !== undefined) {
          a.priceSum += row.listingPrice * qty
          a.priceN += qty
        }
        break
      case 'RTO':
        a.rto += qty
        if (Math.abs(row.shipping ?? 0) > 0) a.shipOnRto = true
        break
      case 'CANCELLED':
        a.cancelled += qty
        break
    }
  }

  const out = new Map<string, SkuStats>()
  for (const [sku, a] of acc) {
    const delivered = a.kept + a.returns
    const dispatched = delivered + a.rto
    out.set(sku, {
      sku,
      rows: a.rows,
      dispatched,
      delivered,
      deliveredKept: a.kept,
      returns: a.returns,
      rto: a.rto,
      cancelled: a.cancelled,
      rtoRate: dispatched > 0 ? a.rto / dispatched : 0,
      returnRate: delivered > 0 ? a.returns / delivered : 0,
      netSettlement: a.settlement,
      tcsTds: a.tcsTds,
      avgPrice: a.priceN > 0 ? a.priceSum / a.priceN : null,
      avgShipInclGst: delivered > 0 && a.ship > 0 ? a.ship / delivered : null,
      avgReturnShipInclGst: a.returns > 0 && a.returnShip > 0 ? a.returnShip / a.returns : null,
      forwardChargedOnRto: a.shipOnRto,
      avgSettlementPerDelivered: delivered > 0 ? (a.settlement + a.tcsTds) / delivered : null,
      lowData: dispatched < LOW_DATA_ORDERS,
    })
  }
  return out
}

// --------------------------------------------------------------- calibrate

/** Report-level extras that are not on the order lines (e.g. the Ads Cost sheet). */
export interface SkuExtras {
  /** Ads charged to this SKU over the report period, ₹ (sign ignored). */
  adsTotal?: number
  /**
   * Net penalties and claims for this SKU, ₹, as a cost: recoveries Meesho
   * took are positive, compensation Meesho paid is negative.
   */
  penaltiesTotal?: number
}

/**
 * The report's numbers in place of our estimates, each tagged FROM_REPORT.
 *
 * Fees (price, shipping, return charge) are the actual charges, so they are
 * used whatever the order count. RTO and return RATES are only trusted from
 * LOW_DATA_ORDERS dispatched up; below that the estimates stay and the
 * product is flagged "Low data".
 */
export function calibrate(input: KeepInput, stats: SkuStats, extras: SkuExtras = {}): KeepInput {
  const feeGst = 1 + (input.feeGstRate ?? rates.feeGstRate)
  const next: KeepInput = { ...input }
  const sources: Partial<Record<KeepField, InputSource>> = { ...input.sources }
  const take = <K extends KeepField>(field: K, value: KeepInput[K]) => {
    next[field] = value
    sources[field] = 'FROM_REPORT'
  }

  if (stats.avgPrice !== null) take('price', stats.avgPrice)
  if (stats.avgShipInclGst !== null) take('fwdPerDelivered', stats.avgShipInclGst / feeGst)
  if (stats.avgReturnShipInclGst !== null) take('revPerReturn', stats.avgReturnShipInclGst / feeGst)
  if (stats.rto > 0) take('fwdOnRto', stats.forwardChargedOnRto)
  if (!stats.lowData) {
    take('rtoRate', stats.rtoRate)
    take('returnRate', stats.returnRate)
  }
  if (stats.dispatched > 0 && extras.adsTotal !== undefined) {
    take('adPerOrder', Math.abs(extras.adsTotal) / stats.dispatched)
  }
  if (stats.dispatched > 0 && extras.penaltiesTotal !== undefined) {
    take('penaltiesPerOrder', extras.penaltiesTotal / stats.dispatched)
  }
  if (stats.delivered > 0) next.tcsTdsPerDelivered = stats.tcsTds / stats.delivered
  // Whatever the payout per delivered order still differs by once the report's own price,
  // shipping and rates are in: deductions (or extra) the report shows that no input explains.
  // Only when the report shows the TCS / TDS it deducted: otherwise that claimable tax would
  // be indistinguishable from a deduction and wrongly counted as a cost.
  if (stats.avgSettlementPerDelivered !== null && stats.avgPrice !== null && stats.tcsTds > 0) {
    const explained = modelSettlementPerDelivered({ ...next, rtoRate: stats.rtoRate, returnRate: stats.returnRate })
    next.otherPerDelivered = explained - stats.avgSettlementPerDelivered
  }

  next.sources = sources
  return next
}

// --------------------------------------------------------------- reconcile

/** Within this share of the model, the report "matches" (spec 6.3). */
export const RECONCILE_TOLERANCE = 0.05

/**
 * What the model expects Meesho to pay per delivered order, before TCS / TDS:
 * a kept order pays the price less forward shipping (incl. GST); a return
 * claws back forward and return shipping (incl. GST); an RTO pays nothing,
 * or costs the forward fee when that is charged on RTOs. Ads and penalties
 * are separate report lines and stay out of this number.
 */
export function modelSettlementPerDelivered(input: KeepInput): number {
  const N = rates.unitsBasis
  const g = 1 + (input.feeGstRate ?? rates.feeGstRate)
  const R = N * input.rtoRate
  const D = N - R
  if (D <= 0) return 0
  const Q = D * input.returnRate
  const C = D - Q
  const fwd = input.fwdPerDelivered * g
  const rev = input.revPerReturn * g
  const total = C * (input.price - fwd) - Q * (fwd + rev) - (input.fwdOnRto ? R * fwd : 0)
  return total / D
}

export interface GapLine {
  field: KeepField
  model: number | boolean
  report: number | boolean
  /** How much swapping this one input moves the model's payout per delivered order, ₹. */
  effectPerDelivered: number
}

export interface Reconciliation {
  status: 'MATCHES' | 'DIFFERS' | 'NO_DELIVERIES'
  /** Model payout per delivered order, ₹. */
  model: number
  /** Report payout per delivered order (TCS / TDS added back), ₹. */
  report: number
  /** report − model, ₹ per delivered order. */
  difference: number
  /** difference ÷ model. */
  differencePct: number
  /** The inputs that explain the gap, largest first. Empty when it matches. */
  gapLines: GapLine[]
  /** The input to use from here on: the report's numbers, always (hard rule 1). */
  calibrated: KeepInput
  lowData: boolean
}

const GAP_FIELDS: KeepField[] = ['price', 'fwdPerDelivered', 'revPerReturn', 'rtoRate', 'returnRate', 'fwdOnRto']

export function reconcile(input: KeepInput, stats: SkuStats, extras: SkuExtras = {}): Reconciliation {
  const calibrated = calibrate(input, stats, extras)
  const model = modelSettlementPerDelivered(input)

  if (stats.avgSettlementPerDelivered === null) {
    return {
      status: 'NO_DELIVERIES',
      model,
      report: 0,
      difference: 0,
      differencePct: 0,
      gapLines: [],
      calibrated,
      lowData: stats.lowData,
    }
  }

  const report = stats.avgSettlementPerDelivered
  const difference = report - model
  const differencePct = model !== 0 ? difference / Math.abs(model) : Number.POSITIVE_INFINITY
  const matches = Math.abs(differencePct) <= RECONCILE_TOLERANCE

  const gapLines: GapLine[] = []
  if (!matches) {
    for (const field of GAP_FIELDS) {
      if (calibrated[field] === input[field]) continue
      const swapped = modelSettlementPerDelivered({ ...input, [field]: calibrated[field] })
      gapLines.push({
        field,
        model: input[field],
        report: calibrated[field],
        effectPerDelivered: swapped - model,
      })
    }
    gapLines.sort((a, b) => Math.abs(b.effectPerDelivered) - Math.abs(a.effectPerDelivered))
  }

  return {
    status: matches ? 'MATCHES' : 'DIFFERS',
    model,
    report,
    difference,
    differencePct,
    gapLines,
    calibrated,
    lowData: stats.lowData,
  }
}

/**
 * The reconciliation the app shows after an upload (spec 6.3).
 *
 * The question it answers is "does our fee model reproduce what Meesho
 * actually paid?". So the model takes the report's own order counts (RTO and
 * return rates) and price, and keeps only the fee side as our estimate:
 * shipping by weight, 18% GST on fees, who pays on RTOs and returns. A gap
 * then points at a fee or policy we have wrong, never at a category default
 * that simply differs from this seller.
 *
 * The input to use from here on is still the full calibration (hard rule 1).
 */
export function reconcileReport(input: KeepInput, stats: SkuStats, extras: SkuExtras = {}): Reconciliation {
  const withCounts: KeepInput = {
    ...input,
    rtoRate: stats.rtoRate,
    returnRate: stats.returnRate,
    ...(stats.avgPrice !== null ? { price: stats.avgPrice } : {}),
  }
  return { ...reconcile(withCounts, stats, extras), calibrated: calibrate(input, stats, extras) }
}
