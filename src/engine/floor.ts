/**
 * The floor calculation (spec section 6.1) — the heart of Sahi Daam.
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
export function slabFor(weightG: number): ResolvedSlab {
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

export interface CostLine {
  key: CostLineKey
  /** English label; `labelKey` is what i18n translates in a later phase. */
  label: string
  labelKey: string
  /** The arithmetic that produced `amount`, e.g. "100 × ₹50". */
  working: string
  /** ₹ for the whole basis of 100 dispatched orders. */
  amount: number
}

export interface FloorResult {
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
  input: Required<Omit<FloorInput, 'unitOverrides' | 'fees'>> & {
    fees: Fees
    unitOverrides: UnitOverrides
  }
}

// -------------------------------------------------------------- the calculation

/**
 * The floor for one set of inputs, with every intermediate value and the
 * working for each of the seven cost lines.
 */
export function floor(input: FloorInput): FloorResult {
  const fees: Fees = { ...defaultFees, ...input.fees }
  const adSpendPerOrder = input.adSpendPerOrder ?? 0
  const seasonIndex = input.seasonIndex ?? 1
  const ov = input.unitOverrides ?? {}

  const N = fees.unitsBasis
  const slab = slabFor(input.weightG)

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
      label: 'Forward shipping',
      labelKey: 'cost.forward',
      working: `${units(N)} × ${inr(slab.forward)}`,
      amount: forwardCost,
    },
    {
      key: 'reverse',
      label: 'Reverse shipping (RTO + returns)',
      labelKey: 'cost.reverse',
      working: `(${units(rtoUnits)} + ${units(returnUnits)}) × ${inr(slab.reverse)}`,
      amount: reverseCost,
    },
    {
      key: 'gst',
      label: 'GST on forward shipping',
      labelKey: 'cost.gst',
      working: `${pct(fees.gstRate, 0)} × ${inr(forwardCost)}`,
      amount: gstCost,
    },
    {
      key: 'packaging',
      label: 'Packaging',
      labelKey: 'cost.packaging',
      working: `${units(N)} × ${inr(input.packagingCost)}`,
      amount: packagingTotal,
    },
    {
      key: 'cod',
      label: 'COD handling',
      labelKey: 'cost.cod',
      working: `${units(N)} × ${pct(input.codShare, 0)} × ${inr(fees.codFee)}`,
      amount: codCost,
    },
    {
      key: 'writeOff',
      label: 'Unsellable returns (product written off)',
      labelKey: 'cost.writeOff',
      working: `${units(writeOffUnits)} × ${inr(input.cogs)}`,
      amount: writeOffCost,
    },
    {
      key: 'ad',
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
    },
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
  const category = getCategory(input.categoryId)
  const returnRates = override ?? {
    low: category.returnRateLow,
    expected: category.returnRateExpected,
    high: category.returnRateHigh,
  }
  const results = {
    low: floor({ ...input, returnRate: returnRates.low }),
    expected: floor({ ...input, returnRate: returnRates.expected }),
    high: floor({ ...input, returnRate: returnRates.high }),
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
