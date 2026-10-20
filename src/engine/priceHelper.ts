/**
 * Price helper (MVP spec v2, 7.6), on engine v2. Pure, no React.
 *
 * The seller types 3–10 prices of similar products from the Meesho app; we
 * never scrape. From those and the floor:
 *
 *   Launch    floor + minimum margin → market middle
 *   Growing   current price → +₹10 (one step), unless a step is still being judged
 *   Steady    hold; don't match undercuts below the floor
 *   Clearing  markdown ladder in 5% steps that stops at the floor
 *
 * THE GUARDRAIL (hard rule 3): no number this file recommends is below the
 * floor. Launch, Growing and Steady stay at or above floor + minimum margin;
 * the Clearing ladder may rest on the floor itself (rounded up to a whole
 * rupee). Tested over 1,000 random inputs for both GST settings.
 */
import { type KeepInput, keepPerSale, shippingFor, withPrepaidPush } from './keep'

export type Stage = 'LAUNCH' | 'GROWING' | 'STEADY' | 'CLEARING'
export const STAGES: readonly Stage[] = ['LAUNCH', 'GROWING', 'STEADY', 'CLEARING'] as const

/** A competitor price is an outlier below 30% or above 300% of the median (spec 7.6). */
export const OUTLIER_LOW = 0.3
export const OUTLIER_HIGH = 3
/** Fewer than this many usable prices → a faded range (spec 8.3). */
export const MIN_RELIABLE_PRICES = 3
export const MAX_PRICES = 10
/** One price step while growing. */
export const GROW_STEP = 10
/** A price change younger than this is still being judged: Growing holds instead of stepping again. */
export const STEP_JUDGE_DAYS = 14

/** Each clearance markdown. */
export const MARKDOWN_STEP = 0.05

/** Same thinnest worthwhile margin as the prototype: ₹5, or 2% of the floor. */
export function minMargin(floor: number): number {
  return Math.max(5, 0.02 * floor)
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return Number.NaN
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo)
}

export interface Market {
  prices: number[]
  /** Indexes into `prices` that look like outliers. */
  outliers: number[]
  /** The prices used: everything that isn't an outlier. */
  used: number[]
  median: number
  /** Top of the bottom quarter / bottom of the top quarter of `used`. */
  p25: number
  p75: number
  /** At least 3 usable prices. */
  reliable: boolean
}

export function market(prices: number[]): Market {
  const valid = prices.filter((p) => Number.isFinite(p) && p > 0)
  const rawMedian = quantile([...valid].sort((a, b) => a - b), 0.5)
  const outliers = prices
    .map((p, i) => (p < OUTLIER_LOW * rawMedian || p > OUTLIER_HIGH * rawMedian ? i : -1))
    .filter((i) => i >= 0)
  const used = prices.filter((_, i) => !outliers.includes(i)).sort((a, b) => a - b)
  return {
    prices,
    outliers,
    used,
    median: quantile(used, 0.5),
    p25: quantile(used, 0.25),
    p75: quantile(used, 0.75),
    reliable: used.length >= MIN_RELIABLE_PRICES,
  }
}

export interface PriceRange {
  stage: Stage
  /** The floor this range respects, ₹. */
  floor: number
  /** Whole rupees. Both ≥ the floor. */
  low: number
  high: number
  /** The single price "Use this price" applies. */
  target: number
  /** Clearing only: each 5% markdown, ending at the floor. */
  ladder: number[]
  /** True when the stage wanted a price under floor + margin and was lifted. */
  lifted: boolean
  /** False when no price breaks even (nothing survives RTO and returns). */
  viable: boolean
  /** Growing only: holding because the last price step is still being judged. */
  waitingOnStep: boolean
}

export interface PriceRangeArgs {
  input: KeepInput
  /** What the product is listed at now. */
  currentPrice: number
  stage: Stage
  market: Market | null
  /** The last price change is under STEP_JUDGE_DAYS old (spec 7.9: judge a step before the next). */
  recentStep?: boolean
}

export function priceRange({ input, currentPrice, stage, market: m, recentStep = false }: PriceRangeArgs): PriceRange {
  const result = keepPerSale(input)
  const floor = result.floor
  if (!result.viable || !Number.isFinite(floor)) {
    return { stage, floor, low: Number.NaN, high: Number.NaN, target: Number.NaN, ladder: [], lifted: false, viable: false, waitingOnStep: false }
  }
  const atFloor = Math.ceil(floor)
  const safe = Math.ceil(floor + minMargin(floor))
  const lift = (p: number) => Math.max(safe, Math.round(p))
  const middle = m && m.used.length > 0 ? m.median : Number.NaN

  let low: number
  let high: number
  let target: number
  let ladder: number[] = []
  let lifted = false
  let waitingOnStep = false

  switch (stage) {
    case 'LAUNCH': {
      low = safe
      high = Number.isFinite(middle) ? lift(middle) : safe
      lifted = Number.isFinite(middle) && middle < safe
      target = high
      break
    }
    case 'GROWING': {
      low = lift(currentPrice)
      lifted = currentPrice < safe
      // A step still being judged: hold rather than ratchet another ₹10 on every visit.
      waitingOnStep = recentStep && !lifted
      high = waitingOnStep ? low : low + GROW_STEP
      target = lifted || waitingOnStep ? low : high
      break
    }
    case 'STEADY': {
      low = high = target = lift(currentPrice)
      lifted = currentPrice < safe
      break
    }
    case 'CLEARING': {
      const start = Math.max(atFloor, Math.round(currentPrice))
      for (let k = 1; k <= 20; k++) {
        const step = Math.round(start * (1 - MARKDOWN_STEP * k))
        if (step <= atFloor) {
          ladder.push(atFloor)
          break
        }
        ladder.push(step)
      }
      ladder = [...new Set(ladder)]
      lifted = currentPrice < atFloor
      high = start
      low = ladder.length > 0 ? ladder[ladder.length - 1]! : start
      target = ladder[0] ?? start
      break
    }
  }
  return { stage, floor, low, high, target, ladder, lifted, viable: true, waitingOnStep }
}

/** "Higher than most similar products": above the top quarter of the entered prices. */
export function visibilityWarning(price: number, m: Market | null): boolean {
  return m !== null && m.reliable && price > m.p75
}

/** Floor above every (non-outlier) price entered: no listing in this market breaks even. */
export function notViable(floor: number, m: Market | null): boolean {
  return m !== null && m.used.length > 0 && floor > m.used[m.used.length - 1]!
}

export type FixId = 'prepaid' | 'lighter' | 'bundle' | 'cost'

export interface Fix {
  id: FixId
  /** The floor after the fix, ₹ (per unit for the bundle). */
  floor: number
  /** Fix-specific numbers for the sentence the screen shows. */
  detail: Record<string, number>
}

/**
 * The four not-viable fixes (spec 7.6), each with its new floor:
 * push prepaid, a lighter parcel (or lighter packaging when already in the
 * lightest slab), a bundle of 2, and product cost down 10%.
 */
export function notViableFixes(input: KeepInput, weightG: number): Fix[] {
  const floorOf = (i: KeepInput) => keepPerSale(i).floor
  const fixes: Fix[] = []

  const pushed = withPrepaidPush(input)
  fixes.push({ id: 'prepaid', floor: floorOf(pushed), detail: { rtoFrom: input.rtoRate, rtoTo: pushed.rtoRate } })

  // The next slab down saves the slab difference on whatever the seller pays now.
  const now = shippingFor(weightG)
  const slabFloors = [500, 1000, 1500, 2000]
  const lowerMax = [...slabFloors].reverse().find((max) => max < weightG && shippingFor(max).forward < now.forward)
  if (lowerMax !== undefined) {
    const lower = shippingFor(lowerMax)
    fixes.push({
      id: 'lighter',
      floor: floorOf({
        ...input,
        fwdPerDelivered: Math.max(0, input.fwdPerDelivered - (now.forward - lower.forward)),
        revPerReturn: Math.max(0, input.revPerReturn - (now.reverse - lower.reverse)),
      }),
      detail: { targetG: lowerMax, shedG: weightG - lowerMax },
    })
  } else {
    const half = Math.round(input.packagingPerOrder / 2)
    fixes.push({
      id: 'lighter',
      floor: floorOf({ ...input, packagingPerOrder: half }),
      detail: { packagingFrom: input.packagingPerOrder, packagingTo: half },
    })
  }

  // One parcel, two units: per-order costs are shared, so halve them per unit.
  const bundleFloor = floorOf({ ...input, cost: input.cost * 2 })
  fixes.push({ id: 'bundle', floor: bundleFloor / 2, detail: { pairPrice: bundleFloor } })

  fixes.push({ id: 'cost', floor: floorOf({ ...input, cost: input.cost * 0.9 }), detail: { costTo: input.cost * 0.9 } })
  return fixes
}
