/**
 * Engine v2: what the seller keeps per sale, and their floor (MVP spec v2, 6.1–6.2).
 *
 * This sits beside floor.ts rather than replacing it. floor.ts drives the
 * prototype's story pages and its default outputs must not move; this file
 * drives the MVP. On the same inputs the two agree to the paisa (tested).
 *
 * What v2 adds over sellerFloor():
 *   - RTO and return rates are direct inputs, so a report can drop its own
 *     numbers straight in (no COD-mix blend in the way)
 *   - shipping fees are direct inputs too (report average → seller → estimate)
 *   - GST-registered is the default, with the output GST rate per category
 *   - penalties / claims per order, from the report
 *   - TCS / TDS carried as "tax deducted, claimable", never as a cost
 *   - every input carries where it came from
 *
 * Per 100 dispatched (N):
 *
 *   R = N × rtoRate          never delivered
 *   D = N − R                delivered
 *   Q = D × returnRate       customer returns
 *   C = D − Q                clean sales
 *
 *   forward   = (fwdOnRto ? N : D) × f
 *   reverse   = Q × r
 *   feeGST    = 18% × (forward + reverse)   a cost only if NOT GST-registered
 *   packaging = N × packagingPerOrder
 *   ads       = N × adPerOrder
 *   writeOff  = Q × unsellableShare × c
 *   penalties = N × penaltiesPerOrder
 *   other     = D × otherPerDelivered       from a report: deductions no line above explains
 *
 *   pNet  = registered ? p ÷ (1 + gstRate) : p
 *   keep  = pNet − c − costs ÷ C
 *   floor = (c + costs ÷ C) × (registered ? 1 + gstRate : 1)
 *
 * Pure, framework-free. No React imports.
 */
import { type BuyerRegion, categoryRates, rates } from '../data/rates'

/** Where a number came from — every number on screen shows one (hard rule 7). */
export type InputSource = 'FROM_REPORT' | 'YOU_ENTERED' | 'ESTIMATED'

export interface KeepInput {
  /** Listed price p, ₹ (includes output GST for a registered seller). */
  price: number
  /** Product cost c, ₹ — without GST if the seller claims input credit. */
  cost: number
  /** Forward shipping f, ₹ per delivered order, before GST. */
  fwdPerDelivered: number
  /** Reverse shipping r, ₹ per customer return, before GST. */
  revPerReturn: number
  /** Share of dispatched orders that never reach the buyer, 0..1. */
  rtoRate: number
  /** Customer returns as a share of DELIVERED orders, 0..1. */
  returnRate: number
  /** Share of returns that cannot be resold, 0..1. */
  unsellableShare: number
  /** ₹ per dispatched order. */
  packagingPerOrder: number
  /** ₹ per dispatched order. */
  adPerOrder: number
  /** ₹ per dispatched order, from the report. */
  penaltiesPerOrder: number
  gstRegistered: boolean
  /** Output GST in the listed price, e.g. 0.05. Ignored when not registered. */
  outputGstRate: number
  /** Forward fee also charged on RTO orders (disputed; default off). */
  fwdOnRto: boolean
  /** GST on Meesho's fees. Default 18%. */
  feeGstRate?: number
  /**
   * TCS + TDS deducted per delivered order, ₹. Shown as "tax deducted,
   * claimable"; never a cost, so it never moves `keep` (spec 6.3).
   */
  tcsTdsPerDelivered?: number
  /**
   * "Other deductions from your report", ₹ per delivered order: how much less
   * Meesho paid than price, shipping and rates explain (negative when it paid
   * more). Set only by report calibration.
   */
  otherPerDelivered?: number
  /** For the monthly figure. */
  cleanSalesPerMonth?: number
  /** Where each input came from. Anything missing reads as ESTIMATED. */
  sources?: Partial<Record<KeepField, InputSource>>
}

/** The inputs that carry a source chip. */
export const KEEP_FIELDS = [
  'price',
  'cost',
  'fwdPerDelivered',
  'revPerReturn',
  'rtoRate',
  'returnRate',
  'unsellableShare',
  'packagingPerOrder',
  'adPerOrder',
  'penaltiesPerOrder',
  'outputGstRate',
  'fwdOnRto',
] as const

export type KeepField = (typeof KEEP_FIELDS)[number]

export interface KeepLines {
  forward: number
  reverse: number
  /** GST on the two fees, whether or not it is a cost. */
  feeGst: number
  /** The part of feeGst that is a cost: 0 for a registered seller. */
  feeGstCost: number
  packaging: number
  ads: number
  writeOff: number
  penalties: number
  /** Other deductions from a report (negative when Meesho paid more). */
  other: number
}

export interface KeepResult {
  N: number
  R: number
  D: number
  Q: number
  C: number
  lines: KeepLines
  /** Sum of the cost lines for 100 dispatched, ₹. */
  costs: number
  costsPerCleanSale: number
  /** Price net of output GST. */
  pNet: number
  /** What the seller keeps per clean sale, ₹. Negative below the floor. */
  keep: number
  /** Lowest listed price that breaks even, ₹. */
  floor: number
  /** c + costs ÷ C: what each sale must net before output GST. */
  netFloor: number
  /** price − cost: what the seller thinks they make. */
  naiveMargin: number
  /** cleanSalesPerMonth × keep, or null when no order count is known. */
  monthly: number | null
  /** Tax deducted on 100 dispatched (TCS + TDS), claimable, not a cost. */
  taxDeductedClaimable: number
  /** False when no order survives: no price breaks even. */
  viable: boolean
  outputGstRate: number
}

export function keepPerSale(input: KeepInput): KeepResult {
  const N = rates.unitsBasis
  const feeGstRate = input.feeGstRate ?? rates.feeGstRate

  const R = N * input.rtoRate
  const D = N - R
  const Q = D * input.returnRate
  const C = D - Q

  const forward = (input.fwdOnRto ? N : D) * input.fwdPerDelivered
  const reverse = Q * input.revPerReturn
  const feeGst = feeGstRate * (forward + reverse)
  const feeGstCost = input.gstRegistered ? 0 : feeGst
  const packaging = N * input.packagingPerOrder
  const ads = N * input.adPerOrder
  const writeOff = Q * input.unsellableShare * input.cost
  const penalties = N * input.penaltiesPerOrder
  const other = D * (input.otherPerDelivered ?? 0)

  const costs = forward + reverse + feeGstCost + packaging + ads + writeOff + penalties + other
  const outputGstRate = input.gstRegistered ? input.outputGstRate : 0
  const pNet = input.price / (1 + outputGstRate)

  const viable = C > 0
  const costsPerCleanSale = viable ? costs / C : Number.POSITIVE_INFINITY
  const netFloor = input.cost + costsPerCleanSale
  const keep = pNet - netFloor
  const floor = netFloor * (1 + outputGstRate)

  return {
    N,
    R,
    D,
    Q,
    C,
    lines: { forward, reverse, feeGst, feeGstCost, packaging, ads, writeOff, penalties, other },
    costs,
    costsPerCleanSale,
    pNet,
    keep,
    floor,
    netFloor,
    naiveMargin: input.price - input.cost,
    monthly: input.cleanSalesPerMonth === undefined ? null : input.cleanSalesPerMonth * keep,
    taxDeductedClaimable: D * (input.tcsTdsPerDelivered ?? 0),
    viable,
    outputGstRate,
  }
}

/** The "if returns rise 5 points" line under the main number (spec 6.2). */
export const RETURNS_STRESS_POINTS = 0.05

export function keepIfReturnsRise(
  input: KeepInput,
  points: number = RETURNS_STRESS_POINTS,
): KeepResult {
  return keepPerSale({ ...input, returnRate: Math.min(1, input.returnRate + points) })
}

// ---------------------------------------------------------------- estimates

/** Forward and reverse shipping before GST for a packed weight. */
export function shippingFor(weightG: number): { forward: number; reverse: number } {
  const { slabs, extraStep } = rates.shipping
  const w = Math.max(0, weightG)
  const slab = slabs.find((s) => w <= s.maxG)
  if (slab) return { forward: slab.forward, reverse: slab.reverse }
  const last = slabs[slabs.length - 1]!
  const steps = Math.ceil((w - last.maxG) / extraStep.stepG)
  return {
    forward: last.forward + steps * extraStep.forward,
    reverse: last.reverse + steps * extraStep.reverse,
  }
}

export interface ShopSetup {
  gstRegistered: boolean
  buyerRegion: BuyerRegion
  prepaidDiscount: boolean
}

export const DEFAULT_SHOP: ShopSetup = {
  gstRegistered: rates.gstRegisteredDefault,
  buyerRegion: 'mixed',
  prepaidDiscount: false,
}

/**
 * The shop-setup RTO prior, before any report: the DICE COD / prepaid rates,
 * the COD rate scaled by buyer region, the COD share cut by a prepaid discount.
 * Mixed buyers, no discount → 80% × 20% + 20% × 5% = 17%.
 */
export function rtoPrior(region: BuyerRegion, prepaidDiscount: boolean): number {
  const p = rates.rtoPrior
  const codShare = Math.max(0, p.codShare - (prepaidDiscount ? p.prepaidDiscountCodShift : 0))
  const rtoCod = p.rtoCod * p.regionCodRtoMultiplier[region]
  return codShare * rtoCod + (1 - codShare) * p.rtoPrepaid
}

/**
 * How much a prepaid push lowers the RTO rate: the same 20-point COD shift,
 * priced at the gap between COD and prepaid RTO (20% − 5% → 3 points).
 */
export function prepaidPushRtoDrop(): number {
  const p = rates.rtoPrior
  return p.prepaidDiscountCodShift * (p.rtoCod - p.rtoPrepaid)
}

/** The input with a prepaid push applied. Never pushes RTO below prepaid RTO. */
export function withPrepaidPush(input: KeepInput): KeepInput {
  const floorRto = Math.min(input.rtoRate, rates.rtoPrior.rtoPrepaid)
  return { ...input, rtoRate: Math.max(floorRto, input.rtoRate - prepaidPushRtoDrop()) }
}

/**
 * A KeepInput filled from rates.json for a category and shop, which is what a
 * hand-added product starts from. `entered` holds what the seller typed and
 * is tagged YOU_ENTERED; everything else is tagged ESTIMATED.
 */
export function defaultKeepInput(
  categoryId: string,
  entered: Partial<Omit<KeepInput, 'sources'>> & { weightG?: number },
  shop: ShopSetup = DEFAULT_SHOP,
): KeepInput {
  const cat = categoryRates(categoryId)
  const { weightG, ...typed } = entered
  const ship = shippingFor(weightG ?? cat.weightG)

  const sources: Partial<Record<KeepField, InputSource>> = {}
  for (const key of KEEP_FIELDS) if (key in typed) sources[key] = 'YOU_ENTERED'

  return {
    price: 0,
    cost: 0,
    fwdPerDelivered: ship.forward,
    revPerReturn: ship.reverse,
    rtoRate: rtoPrior(shop.buyerRegion, shop.prepaidDiscount),
    returnRate: cat.returnRate,
    unsellableShare: cat.unsellableShare,
    packagingPerOrder: cat.packagingPerOrder,
    adPerOrder: rates.adPerOrder,
    penaltiesPerOrder: rates.penaltiesPerOrder,
    gstRegistered: shop.gstRegistered,
    outputGstRate: cat.outputGstRate,
    fwdOnRto: rates.fwdOnRtoDefault,
    ...typed,
    sources,
  }
}

/** Where one input came from; unlisted inputs are estimates. */
export function sourceOf(input: KeepInput, field: KeepField): InputSource {
  return input.sources?.[field] ?? 'ESTIMATED'
}
