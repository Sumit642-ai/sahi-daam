/**
 * The floor calculation — the heart of Sahi Daam.
 *
 * TWO MODELS LIVE HERE, and the difference between them is who pays.
 *
 *   sellerFloor()  What the SELLER actually pays under Meesho's published
 *                  supplier policy: forward shipping on delivered orders,
 *                  reverse shipping on customer returns, GST on both fees,
 *                  packaging, unsellable returns and ads. No return fee on
 *                  RTOs, no COD fee. Every seller-facing number uses this.
 *
 *   costToServe()  The full logistics cost of the order, whoever pays it:
 *                  every leg on every order plus COD handling. This is the
 *                  deck's original ₹318 model, kept to show what Meesho
 *                  absorbs on the seller's behalf.
 *
 * meeshoAbsorbs() is the part of cost-to-serve the seller does not pay.
 *
 * The rest of this note describes the idea the two share:
 *
 * Meesho charges 0% commission, so a seller's online costs are almost all FLAT
 * PER ORDER: forward shipping, reverse shipping on anything that comes back,
 * GST on the forward leg, packaging, COD handling, the product itself on
 * unsellable returns, and ads. Flat costs take a much bigger share of a cheap
 * product's price, and they are paid on orders that never turn into a clean
 * sale. So the only honest way to read them is: spread the whole overhead of
 * 100 dispatched orders over the clean sales that actually survive.
 *
 *     floor = COGS + (total overhead on 100 dispatched / clean sales)
 *
 * For the deck's kurti that is ₹150 + ₹11,760/70 = ₹318 — not the ₹150 the
 * seller thinks they earn at a ₹300 list price, but a ₹18 loss per sale.
 *
 * Pure, framework-free TypeScript. No React imports (spec section 3).
 */
import {
  type Category,
  type Fees,
  fees as defaultFees,
  getCategory,
  weightSlabExtraStep,
  weightSlabs,
} from '../data'
import policyJson from '../data/policy.json'
import { inr, pct, units } from './format'
import { MAX_RTO, seasonalRto } from './season'

// ----------------------------------------------------------------- weight slab

export interface ResolvedSlab {
  id: string
  label: string
  /** Forward shipping, ₹ per order dispatched. */
  forward: number
  /** Reverse shipping, ₹ per order that comes back (RTO or return). */
  reverse: number
  source: string
}

const LAST_SLAB = weightSlabs[weightSlabs.length - 1]!

/**
 * Forward and reverse shipping for a parcel weight (spec section 5.2).
 * Past the last listed slab, each extra 500 g adds +₹20 forward / +₹30 reverse.
 */
export function slabFor(weightG: number, rateSource: RateSource = 'dice'): ResolvedSlab {
  const dice = diceSlabFor(weightG)
  if (rateSource === 'dice') return dice
  // 2026 reported rates are only published for the first slab. Heavier slabs
  // keep the same rupee uplift over DICE — an ASSUMPTION, labelled as one.
  return {
    ...dice,
    forward: dice.forward + REPORTED_2026.forwardUplift,
    reverse: dice.reverse + REPORTED_2026.reverseUplift,
    source: policyJson.reported2026Forward.source,
  }
}

function diceSlabFor(weightG: number): ResolvedSlab {
  const w = Math.max(0, weightG)
  const match = weightSlabs.find((s) => w <= s.maxG)
  if (match) {
    return {
      id: match.id,
      label: match.label_en,
      forward: match.forward,
      reverse: match.reverse,
      source: match.source,
    }
  }
  const over = w - LAST_SLAB.maxG
  const steps = Math.ceil(over / weightSlabExtraStep.stepG)
  const lowerG = LAST_SLAB.maxG + (steps - 1) * weightSlabExtraStep.stepG + 1
  const upperG = LAST_SLAB.maxG + steps * weightSlabExtraStep.stepG
  return {
    id: `${lowerG}-${upperG}`,
    label: `${lowerG}–${upperG} g`,
    forward: LAST_SLAB.forward + steps * weightSlabExtraStep.forward,
    reverse: LAST_SLAB.reverse + steps * weightSlabExtraStep.reverse,
    source: weightSlabExtraStep.source,
  }
}

/** Forward shipping only, ₹ per order — the `fwd(weight)` of the spec. */
export function fwd(weightG: number): number {
  return slabFor(weightG).forward
}

/** Reverse shipping only, ₹ per returned order — the `rev(weight)` of the spec. */
export function rev(weightG: number): number {
  return slabFor(weightG).reverse
}

// ---------------------------------------------------------------------- policy

/** Whose rate card prices the shipping legs. */
export type RateSource = 'dice' | 'reported2026'

/** Who pays a cost line. */
export type Payer = 'seller' | 'meesho'

export interface SellerPolicy {
  /**
   * DISPUTED. Off (default): the forward fee is charged on delivered orders
   * only, so an RTO costs the seller no shipping at all. On: the forward fee
   * is charged on every dispatched order, as some 2026 seller guides report.
   */
  forwardOnRto: boolean
  rateSource: RateSource
}

export const DEFAULT_POLICY: SellerPolicy = { forwardOnRto: false, rateSource: 'dice' }

/** ₹65 / ₹155 at ≤ 500 g, expressed as the uplift over DICE's ₹50 / ₹120. */
const REPORTED_2026 = {
  forwardUplift: policyJson.reported2026Forward.value - weightSlabs[0]!.forward,
  reverseUplift: policyJson.reported2026Reverse.value - weightSlabs[0]!.reverse,
}

// ---------------------------------------------------------------------- inputs

/**
 * Unit counts may be pinned directly instead of derived from the rates. This is
 * how the deck's worked example is reproduced exactly (spec test 1): the deck
 * states 17 RTO, 13 returns, 6 write-offs and 70 clean sales out of 100, which
 * are rounded whole units, not the continuous model's 17 / 16.6 / 7.6 / 66.4.
 */
export interface UnitOverrides {
  rtoUnits?: number
  deliveredUnits?: number
  returnUnits?: number
  cleanSales?: number
  writeOffUnits?: number
}

export interface FloorInput {
  /** Product cost, ₹ per unit. */
  cogs: number
  /** Parcel weight in grams; picks the shipping slab. */
  weightG: number
  categoryId: string
  /** Share of orders paid by COD, 0..1. */
  codShare: number
  /** RTO rate on COD orders, 0..1. */
  rtoCod: number
  /** RTO rate on prepaid orders, 0..1. */
  rtoPrepaid: number
  /** Returns as a share of DELIVERED orders, 0..1. */
  returnRate: number
  /** Share of returns that cannot be resold, 0..1. */
  writeOffShare: number
  /** Packaging, ₹ per order dispatched. */
  packagingCost: number
  /** Ads, ₹ per order dispatched. Default 0. */
  adSpendPerOrder?: number
  /** RTO season multiplier from season.ts. Default 1. */
  seasonIndex?: number
  /** Pin unit counts instead of deriving them from the rates. */
  unitOverrides?: UnitOverrides
  /** Overrides for fees.json defaults (gstRate, codFee, unitsBasis). */
  fees?: Partial<Fees>
  /** Who-pays settings. Defaults to DEFAULT_POLICY. */
  policy?: Partial<SellerPolicy>
}

// --------------------------------------------------------------------- outputs

export type CostLineKey =
  | 'forward'
  | 'reverse'
  | 'gst'
  | 'packaging'
  | 'cod'
  | 'writeOff'
  | 'ad'
  // Lines Meesho absorbs under the supplier policy (sellerFloor only).
  | 'rtoForward'
  | 'rtoForwardGst'
  | 'rtoReverse'

export interface CostLine {
  key: CostLineKey
  /** English label; `labelKey` is what i18n translates in a later phase. */
  label: string
  labelKey: string
  /** The arithmetic that produced `amount`, e.g. "100 × ₹50". */
  working: string
  /** ₹ for the whole basis of 100 dispatched orders. */
  amount: number
  /** Who pays it. Cost-to-serve lines are all reported as 'seller'. */
  payer: Payer
}

export interface FloorResult {
  /** Which model produced this: what the seller pays, or the full cost to serve. */
  model: 'seller' | 'costToServe'
  /** Units dispatched the whole calculation is based on (100 by convention). */
  unitsBasis: number
  /** Blended RTO rate after the season index, capped at 0.90. */
  rto: number
  rtoUnits: number
  deliveredUnits: number
  returnUnits: number
  cleanSales: number
  writeOffUnits: number

  forwardCost: number
  reverseCost: number
  gstCost: number
  packagingTotal: number
  codCost: number
  writeOffCost: number
  adCost: number

  /** The seven cost lines, each with its working, in display order. */
  costLines: CostLine[]
  /**
   * Seller model only: what Meesho pays on the seller's behalf (RTO legs and
   * COD handling). Not part of `totalOverhead`. Empty for cost-to-serve.
   */
  absorbedLines: CostLine[]
  absorbedTotal: number
  /** absorbedTotal ÷ clean sales. */
  absorbedPerCleanSale: number
  totalOverhead: number
  overheadPerCleanSale: number
  /** COGS + overhead per clean sale. The answer. */
  floor: number

  /** cleanSales / unitsBasis — of 100 dispatched, how many are a clean sale. */
  survivalRate: number

  slab: ResolvedSlab
  /** False when no order survives, so the floor is unreachable at any price. */
  viable: boolean
  /** The resolved inputs, echoed back so a UI panel can show what was used. */
  input: Required<Omit<FloorInput, 'unitOverrides' | 'fees' | 'policy'>> & {
    fees: Fees
    unitOverrides: UnitOverrides
    policy: SellerPolicy
  }
}

// -------------------------------------------------------------- the calculation

/**
 * FULL COST-TO-SERVE: every logistics cost on every order, whoever pays it.
 *
 * Forward on all 100 dispatched, reverse on every RTO and every return, GST on
 * the forward leg, COD handling. This is the deck's original model (₹318 for
 * the kurti) and it is NOT what the seller pays — Meesho's supplier policy
 * takes the RTO return leg and the COD fee off them. It is shown beside the
 * seller floor so the size of what Meesho absorbs is visible.
 */
export function costToServe(input: FloorInput): FloorResult {
  const fees: Fees = { ...defaultFees, ...input.fees }
  const policy: SellerPolicy = { ...DEFAULT_POLICY, ...input.policy }
  const adSpendPerOrder = input.adSpendPerOrder ?? 0
  const seasonIndex = input.seasonIndex ?? 1
  const ov = input.unitOverrides ?? {}

  const N = fees.unitsBasis
  const slab = slabFor(input.weightG, policy.rateSource)

  // Blended RTO across the COD / prepaid mix, lifted by the season, then capped.
  const baselineRto = input.codShare * input.rtoCod + (1 - input.codShare) * input.rtoPrepaid
  const rto = seasonalRto(baselineRto, seasonIndex)

  // Each count falls back to the one above it, so pinning `rtoUnits` alone still
  // flows correctly through delivered -> returns -> clean sales.
  const rtoUnits = ov.rtoUnits ?? N * rto
  const deliveredUnits = ov.deliveredUnits ?? N - rtoUnits
  const returnUnits = ov.returnUnits ?? deliveredUnits * input.returnRate
  const cleanSales = ov.cleanSales ?? deliveredUnits - returnUnits
  const writeOffUnits = ov.writeOffUnits ?? returnUnits * input.writeOffShare

  const forwardCost = N * slab.forward
  const reverseCost = (rtoUnits + returnUnits) * slab.reverse
  const gstCost = fees.gstRate * forwardCost
  const packagingTotal = N * input.packagingCost
  const codCost = N * input.codShare * fees.codFee
  const writeOffCost = writeOffUnits * input.cogs
  const adCost = N * adSpendPerOrder

  const costLines: CostLine[] = [
    {
      key: 'forward',
      payer: 'seller',
      label: 'Forward shipping',
      labelKey: 'cost.forward',
      working: `${units(N)} × ${inr(slab.forward)}`,
      amount: forwardCost,
    },
    {
      key: 'reverse',
      payer: 'seller',
      label: 'Reverse shipping (RTO + returns)',
      labelKey: 'cost.reverse',
      working: `(${units(rtoUnits)} + ${units(returnUnits)}) × ${inr(slab.reverse)}`,
      amount: reverseCost,
    },
    {
      key: 'gst',
      payer: 'seller',
      label: 'GST on forward shipping',
      labelKey: 'cost.gst',
      working: `${pct(fees.gstRate, 0)} × ${inr(forwardCost)}`,
      amount: gstCost,
    },
    {
      key: 'packaging',
      payer: 'seller',
      label: 'Packaging',
      labelKey: 'cost.packaging',
      working: `${units(N)} × ${inr(input.packagingCost)}`,
      amount: packagingTotal,
    },
    {
      key: 'cod',
      payer: 'seller',
      label: 'COD handling',
      labelKey: 'cost.cod',
      working: `${units(N)} × ${pct(input.codShare, 0)} × ${inr(fees.codFee)}`,
      amount: codCost,
    },
    {
      key: 'writeOff',
      payer: 'seller',
      label: 'Unsellable returns (product written off)',
      labelKey: 'cost.writeOff',
      working: `${units(writeOffUnits)} × ${inr(input.cogs)}`,
      amount: writeOffCost,
    },
    {
      key: 'ad',
      payer: 'seller',
      label: 'Ad spend',
      labelKey: 'cost.ad',
      working: `${units(N)} × ${inr(adSpendPerOrder)}`,
      amount: adCost,
    },
  ]

  const totalOverhead = costLines.reduce((sum, line) => sum + line.amount, 0)

  // With no surviving sale there is no price that covers the overhead, so the
  // floor is genuinely infinite rather than some large finite number.
  const viable = cleanSales > 0
  const overheadPerCleanSale = viable ? totalOverhead / cleanSales : Number.POSITIVE_INFINITY
  const floorValue = viable ? input.cogs + overheadPerCleanSale : Number.POSITIVE_INFINITY

  return {
    model: 'costToServe',
    absorbedLines: [],
    absorbedTotal: 0,
    absorbedPerCleanSale: 0,
    unitsBasis: N,
    rto,
    rtoUnits,
    deliveredUnits,
    returnUnits,
    cleanSales,
    writeOffUnits,
    forwardCost,
    reverseCost,
    gstCost,
    packagingTotal,
    codCost,
    writeOffCost,
    adCost,
    costLines,
    totalOverhead,
    overheadPerCleanSale,
    floor: floorValue,
    survivalRate: cleanSales / N,
    slab,
    viable,
    input: {
      cogs: input.cogs,
      weightG: input.weightG,
      categoryId: input.categoryId,
      codShare: input.codShare,
      rtoCod: input.rtoCod,
      rtoPrepaid: input.rtoPrepaid,
      returnRate: input.returnRate,
      writeOffShare: input.writeOffShare,
      packagingCost: input.packagingCost,
      adSpendPerOrder,
      seasonIndex,
      fees,
      unitOverrides: ov,
      policy,
    },
  }
}

// ---------------------------------------------------------------- seller floor

/**
 * WHAT THE SELLER PAYS, under Meesho's published supplier policy.
 *
 *   delivered = N × (1 − RTO)
 *   returns   = delivered × returnRate
 *   clean     = delivered − returns
 *   forward   = delivered × fwd        (N × fwd when forwardOnRto is on)
 *   reverse   = returns × rev          (customer returns only; no RTO fee)
 *   GST       = 18% × (forward + reverse)
 *   packaging = N × packaging          (every order is packed)
 *   write-off = returns × writeOffShare × COGS
 *   ads       = N × ad spend
 *   floor     = COGS + total ÷ clean
 *
 * No COD fee. The RTO legs and COD handling are reported as `absorbedLines`.
 */
export function sellerFloor(input: FloorInput): FloorResult {
  const fees: Fees = { ...defaultFees, ...input.fees }
  const policy: SellerPolicy = { ...DEFAULT_POLICY, ...input.policy }
  const adSpendPerOrder = input.adSpendPerOrder ?? 0
  const seasonIndex = input.seasonIndex ?? 1
  const ov = input.unitOverrides ?? {}

  const N = fees.unitsBasis
  const slab = slabFor(input.weightG, policy.rateSource)

  const baselineRto = input.codShare * input.rtoCod + (1 - input.codShare) * input.rtoPrepaid
  const rto = seasonalRto(baselineRto, seasonIndex)

  const rtoUnits = ov.rtoUnits ?? N * rto
  const deliveredUnits = ov.deliveredUnits ?? N - rtoUnits
  const returnUnits = ov.returnUnits ?? deliveredUnits * input.returnRate
  const cleanSales = ov.cleanSales ?? deliveredUnits - returnUnits
  const writeOffUnits = ov.writeOffUnits ?? returnUnits * input.writeOffShare

  // GST on both fees, at the platform rate (18% unless an admin changes it).
  const gstRate = fees.gstRate
  const forwardUnits = policy.forwardOnRto ? N : deliveredUnits
  const forwardCost = forwardUnits * slab.forward
  const reverseCost = returnUnits * slab.reverse
  const gstCost = gstRate * (forwardCost + reverseCost)
  const packagingTotal = N * input.packagingCost
  const writeOffCost = writeOffUnits * input.cogs
  const adCost = N * adSpendPerOrder

  const costLines: CostLine[] = [
    {
      key: 'forward',
      payer: 'seller',
      label: policy.forwardOnRto
        ? 'Forward shipping (every dispatched order)'
        : 'Forward shipping (delivered orders)',
      labelKey: policy.forwardOnRto ? 'cost.forwardAll' : 'cost.forwardDelivered',
      working: `${units(forwardUnits)} × ${inr(slab.forward)}`,
      amount: forwardCost,
    },
    {
      key: 'reverse',
      payer: 'seller',
      label: 'Reverse shipping (customer returns)',
      labelKey: 'cost.reverseReturns',
      working: `${units(returnUnits)} × ${inr(slab.reverse)}`,
      amount: reverseCost,
    },
    {
      key: 'gst',
      payer: 'seller',
      label: 'GST on your shipping fees',
      labelKey: 'cost.gstFees',
      working: `${pct(gstRate, 0)} × (${inr(forwardCost)} + ${inr(reverseCost)})`,
      amount: gstCost,
    },
    {
      key: 'packaging',
      payer: 'seller',
      label: 'Packaging',
      labelKey: 'cost.packaging',
      working: `${units(N)} × ${inr(input.packagingCost)}`,
      amount: packagingTotal,
    },
    {
      key: 'writeOff',
      payer: 'seller',
      label: 'Unsellable returns (product written off)',
      labelKey: 'cost.writeOff',
      working: `${units(writeOffUnits)} × ${inr(input.cogs)}`,
      amount: writeOffCost,
    },
    {
      key: 'ad',
      payer: 'seller',
      label: 'Ad spend',
      labelKey: 'cost.ad',
      working: `${units(N)} × ${inr(adSpendPerOrder)}`,
      amount: adCost,
    },
  ]

  // What Meesho pays so the seller does not.
  const rtoForward = rtoUnits * slab.forward
  const absorbedLines: CostLine[] = []
  if (!policy.forwardOnRto) {
    absorbedLines.push(
      {
        key: 'rtoForward',
        payer: 'meesho',
        label: 'Forward shipping on RTO orders',
        labelKey: 'cost.rtoForward',
        working: `${units(rtoUnits)} × ${inr(slab.forward)}`,
        amount: rtoForward,
      },
      {
        key: 'rtoForwardGst',
        payer: 'meesho',
        label: 'GST on that forward fee',
        labelKey: 'cost.rtoForwardGst',
        working: `${pct(gstRate, 0)} × ${inr(rtoForward)}`,
        amount: gstRate * rtoForward,
      },
    )
  }
  absorbedLines.push(
    {
      key: 'rtoReverse',
      payer: 'meesho',
      label: 'Return shipping on RTO orders',
      labelKey: 'cost.rtoReverse',
      working: `${units(rtoUnits)} × ${inr(slab.reverse)}`,
      amount: rtoUnits * slab.reverse,
    },
    {
      key: 'cod',
      payer: 'meesho',
      label: 'COD handling',
      labelKey: 'cost.cod',
      working: `${units(N)} × ${pct(input.codShare, 0)} × ${inr(fees.codFee)}`,
      amount: N * input.codShare * fees.codFee,
    },
  )

  const totalOverhead = costLines.reduce((sum, line) => sum + line.amount, 0)
  const absorbedTotal = absorbedLines.reduce((sum, line) => sum + line.amount, 0)
  const viable = cleanSales > 0
  const overheadPerCleanSale = viable ? totalOverhead / cleanSales : Number.POSITIVE_INFINITY
  const floorValue = viable ? input.cogs + overheadPerCleanSale : Number.POSITIVE_INFINITY

  return {
    model: 'seller',
    unitsBasis: N,
    rto,
    rtoUnits,
    deliveredUnits,
    returnUnits,
    cleanSales,
    writeOffUnits,
    forwardCost,
    reverseCost,
    gstCost,
    packagingTotal,
    codCost: 0,
    writeOffCost,
    adCost,
    costLines,
    absorbedLines,
    absorbedTotal,
    absorbedPerCleanSale: viable ? absorbedTotal / cleanSales : Number.POSITIVE_INFINITY,
    totalOverhead,
    overheadPerCleanSale,
    floor: floorValue,
    survivalRate: cleanSales / N,
    slab,
    viable,
    input: {
      cogs: input.cogs,
      weightG: input.weightG,
      categoryId: input.categoryId,
      codShare: input.codShare,
      rtoCod: input.rtoCod,
      rtoPrepaid: input.rtoPrepaid,
      returnRate: input.returnRate,
      writeOffShare: input.writeOffShare,
      packagingCost: input.packagingCost,
      adSpendPerOrder,
      seasonIndex,
      fees,
      unitOverrides: ov,
      policy,
    },
  }
}

/**
 * What Meesho pays on the seller's behalf, per clean sale: the forward fee
 * and its GST on RTO orders (unless that fee is charged to the seller), the
 * RTO return leg, and COD handling.
 */
export function meeshoAbsorbs(input: FloorInput): {
  lines: CostLine[]
  total: number
  perCleanSale: number
} {
  const result = sellerFloor(input)
  return {
    lines: result.absorbedLines,
    total: result.absorbedTotal,
    perCleanSale: result.absorbedPerCleanSale,
  }
}

// ------------------------------------------------------------------ floor range

export interface ReturnRateTriple {
  low: number
  expected: number
  high: number
}

export interface FloorRange {
  /** Floor at the category's low return rate, ₹. */
  low: number
  /** Floor at the category's expected return rate, ₹ — the "most likely". */
  expected: number
  /** Floor at the category's high return rate, ₹. */
  high: number
  /** The full result behind each number, for the Show-working panels. */
  results: { low: FloorResult; expected: FloorResult; high: FloorResult }
  /** The three return rates used, so a UI can label them. */
  returnRates: ReturnRateTriple
}

/**
 * The floor at the category's low / expected / high return rate.
 *
 * `input.returnRate` is ignored here — the three rates come from the category,
 * or from `override` when the seller has edited them in Screen 1's Advanced
 * drawer (spec section 9.2 makes every auto-filled value editable).
 */
export function floorRange(input: FloorInput, override?: ReturnRateTriple): FloorRange {
  return rangeOf(sellerFloor, input, override)
}

/** The same three return rates, priced at full cost-to-serve. */
export function costToServeRange(input: FloorInput, override?: ReturnRateTriple): FloorRange {
  return rangeOf(costToServe, input, override)
}

function rangeOf(
  model: (input: FloorInput) => FloorResult,
  input: FloorInput,
  override?: ReturnRateTriple,
): FloorRange {
  const category = getCategory(input.categoryId)
  const returnRates = override ?? {
    low: category.returnRateLow,
    expected: category.returnRateExpected,
    high: category.returnRateHigh,
  }
  const results = {
    low: model({ ...input, returnRate: returnRates.low }),
    expected: model({ ...input, returnRate: returnRates.expected }),
    high: model({ ...input, returnRate: returnRates.high }),
  }
  return {
    low: results.low.floor,
    expected: results.expected.floor,
    high: results.high.floor,
    results,
    returnRates,
  }
}

// -------------------------------------------------------------- profit helpers

/** What one surviving sale actually earns, ₹. Negative below the floor. */
export function profitPerCleanSale(price: number, floorValue: number): number {
  return price - floorValue
}

/**
 * What 100 dispatched orders earn in total, ₹ — the number that pays the bills.
 *
 * When nothing survives, the floor is infinite and `cleanSales × (price − floor)`
 * is 0 × −Infinity, which is NaN. The honest answer is not "unknown": you sold
 * nothing, so you earned nothing, and you still paid every rupee of overhead.
 */
export function profitPer100Dispatched(price: number, result: FloorResult): number {
  if (!result.viable || result.cleanSales <= 0) return -result.totalOverhead
  return result.cleanSales * (price - result.floor)
}

/**
 * Margin as a share of the list price.
 * A price of zero or less has no meaningful margin; it is reported as -Infinity
 * so verdict logic reads it as a loss rather than as NaN.
 */
export function marginPct(price: number, floorValue: number): number {
  if (price <= 0) return Number.NEGATIVE_INFINITY
  return (price - floorValue) / price
}

// --------------------------------------------------------------------- defaults

/**
 * A FloorInput pre-filled from fees.json and the category, which is what
 * Screen 1 opens with: everything auto-filled, the seller edits COGS and price.
 */
export function defaultFloorInput(
  categoryId: string,
  overrides: Partial<FloorInput> = {},
): FloorInput {
  const category: Category = getCategory(categoryId)
  return {
    cogs: category.exampleCogs,
    weightG: category.defaultWeightG,
    categoryId,
    codShare: defaultFees.codShare,
    rtoCod: defaultFees.rtoCod,
    rtoPrepaid: defaultFees.rtoPrepaid,
    returnRate: category.returnRateExpected,
    writeOffShare: category.writeOffShare,
    packagingCost: category.packagingCost,
    adSpendPerOrder: 0,
    seasonIndex: 1,
    ...overrides,
  }
}

/** Re-exported so callers can assert the cap without reaching into season.ts. */
export { MAX_RTO }
