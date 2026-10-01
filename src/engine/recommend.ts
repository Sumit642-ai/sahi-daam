/**
 * Verdict, NOT_VIABLE fixes, lifecycle recommendation and the guardrail
 * (spec sections 6.2 and 6.4).
 *
 * The one rule that outranks everything else here: no function in this file may
 * return a recommended price below `floorRange.expected`. The market can say
 * whatever it likes — if the band wants a price that loses money on every sale,
 * the answer is to raise the price and show the seller how to lower their floor,
 * not to quietly recommend a loss.
 *
 * Pure, framework-free. No React imports.
 */
import { fees, weightSlabs } from '../data'
import {
  type FloorInput,
  type FloorRange,
  type ReturnRateTriple,
  floorRange,
  marginPct as marginPctOf,
  profitPer100Dispatched,
  profitPerCleanSale,
  slabFor,
} from './floor'
import { type Band, percentileOf } from './band'
import { inr, pct } from './format'

// ------------------------------------------------------------------ guardrail

/**
 * The thinnest margin worth listing at: ₹5, or 2% of the floor, whichever is
 * larger (spec section 6.4). On a ₹318 floor that is ₹6.36.
 */
export function minMarginFor(floorExpected: number): number {
  return Math.max(5, 0.02 * floorExpected)
}

export const GUARDRAIL_WARNING =
  'You are priced above most of the market; impressions may be low. See fixes that lower your floor.'

/**
 * Spec section 6.4: if the target a stage wants is below the floor, return
 * floor + minMargin instead and say so. Never silently clamp.
 *
 * The check is on the stage's RAW target — the price the market or the ladder
 * actually asked for — not on an already-floored number. Checking afterwards
 * would mean the warning never fires, because by then the price has been
 * lifted and looks fine.
 *
 * `ladderStop` is the decline case: spec section 6.4 says that ladder "stops at
 * floor.expected", so it rests on the floor itself rather than floor +
 * minMargin. The seller is still told why.
 */
function applyGuardrail(
  rawTarget: number,
  range: FloorRange,
  warnings: string[],
  ladderStop = false,
): number {
  const floorExpected = range.expected
  if (rawTarget >= floorExpected) return rawTarget
  warnings.push(GUARDRAIL_WARNING)
  return ladderStop ? floorExpected : floorExpected + minMarginFor(floorExpected)
}

/** Prices are shown and listed in whole rupees. */
const money = (n: number) => Math.round(n)

// -------------------------------------------------------------------- verdict

export type Verdict = 'NOT_VIABLE' | 'LOSS' | 'THIN' | 'HEALTHY'

export interface Fix {
  id: 'prepaid' | 'lighter' | 'bundle' | 'cogs'
  label: string
  detail: string
  /** The floor after the fix, ₹ per unit. */
  newFloor: number
  /** newFloor − current floor. Negative is an improvement. */
  delta: number
  /** True when the fix on its own brings the floor back inside the band. */
  viableNow: boolean
  /** Honest limitation of the fix, where there is one. */
  caveat?: string
}

export interface VerdictResult {
  verdict: Verdict
  label: string
  /** One line with the actual numbers in it. */
  detail: string
  marginPct: number
  profitPerCleanSale: number
  profitPer100Dispatched: number
  /** Where the price sits in the competitor band, 0–100. */
  percentile: number
  /** Populated only for NOT_VIABLE (spec section 6.2). */
  fixes: Fix[]
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  NOT_VIABLE: 'Not viable',
  LOSS: 'Loss on every order',
  THIN: 'Thin margin',
  HEALTHY: 'Healthy',
}

/**
 * Spec section 6.2.
 *
 * NOT_VIABLE is checked first because it is a property of the product, not of
 * the price: if the floor is above the 90th percentile of the market, there is
 * no price in the band that makes money, and changing the price cannot help.
 */
export function verdictFor(args: {
  price: number
  input: FloorInput
  range: FloorRange
  band: Band
  returnRates?: ReturnRateTriple
}): VerdictResult {
  const { price, input, range, band, returnRates } = args
  const floorExpected = range.expected
  const margin = marginPctOf(price, floorExpected)
  const perSale = profitPerCleanSale(price, floorExpected)
  const per100 = profitPer100Dispatched(price, range.results.expected)
  const percentile = percentileOf(band, price)

  if (floorExpected > band.p90) {
    return {
      verdict: 'NOT_VIABLE',
      label: VERDICT_LABEL.NOT_VIABLE,
      detail:
        `Your floor is ${inr(floorExpected)}, but 90% of this market sells below ` +
        `${inr(band.p90)}. To break even you would have to list above almost every ` +
        `competitor — and at that price buyers barely see you. Raising the price is not ` +
        `a way out of this one; the costs have to come down.`,
      marginPct: margin,
      profitPerCleanSale: perSale,
      profitPer100Dispatched: per100,
      percentile,
      fixes: notViableFixes({ input, range, band, returnRates }),
    }
  }

  if (price < floorExpected) {
    return {
      verdict: 'LOSS',
      label: VERDICT_LABEL.LOSS,
      detail:
        `At ${inr(price)} you are ${inr(floorExpected - price)} below your floor of ` +
        `${inr(floorExpected)}. That is ${inr(Math.abs(perSale))} out of your pocket on every ` +
        `sale, or ${inr(Math.abs(per100))} across 100 orders dispatched.`,
      marginPct: margin,
      profitPerCleanSale: perSale,
      profitPer100Dispatched: per100,
      percentile,
      fixes: [],
    }
  }

  if (margin < 0.1) {
    return {
      verdict: 'THIN',
      label: VERDICT_LABEL.THIN,
      detail:
        `At ${inr(price)} you clear ${inr(perSale)} per sale — a ${pct(margin)} margin. ` +
        `One bad week of returns wipes that out. Aim for at least ` +
        `${inr(floorExpected / 0.9)} for a 10% margin.`,
      marginPct: margin,
      profitPerCleanSale: perSale,
      profitPer100Dispatched: per100,
      percentile,
      fixes: [],
    }
  }

  return {
    verdict: 'HEALTHY',
    label: VERDICT_LABEL.HEALTHY,
    detail:
      `At ${inr(price)} you clear ${inr(perSale)} per sale — a ${pct(margin)} margin — ` +
      `and ${inr(per100)} across 100 orders dispatched. You sit at the ` +
      `${Math.round(percentile)}th percentile of the market.`,
    marginPct: margin,
    profitPerCleanSale: perSale,
    profitPer100Dispatched: per100,
    percentile,
    fixes: [],
  }
}

// ------------------------------------------------------- NOT_VIABLE fixes (6.2)

/** The slab immediately below the one this weight falls in, if there is one. */
function nextLowerSlab(weightG: number) {
  const current = slabFor(weightG)
  const index = weightSlabs.findIndex((s) => s.id === current.id)
  if (index > 0) return weightSlabs[index - 1]!
  // Above the listed slabs, the step back down is one 500 g step.
  if (index === -1 && weightG > weightSlabs[weightSlabs.length - 1]!.maxG) {
    return { ...weightSlabs[weightSlabs.length - 1]!, maxG: weightG - 500 }
  }
  return null
}

/**
 * The four fixes from spec section 6.2, each with the floor it would produce so
 * the seller can see the size of the effect rather than being told to "reduce
 * costs".
 */
export function notViableFixes(args: {
  input: FloorInput
  range: FloorRange
  band: Band
  returnRates?: ReturnRateTriple
}): Fix[] {
  const { input, range, band, returnRates } = args
  const current = range.expected
  const refloor = (patch: Partial<FloorInput>) =>
    floorRange({ ...input, ...patch }, returnRates).expected

  const fixes: Fix[] = []

  // 1. Push prepaid — COD share down 20 points.
  const newCodShare = Math.max(0, input.codShare - 0.2)
  const prepaidFloor = refloor({ codShare: newCodShare })
  fixes.push({
    id: 'prepaid',
    label: 'Push buyers to prepaid',
    detail:
      `Move your COD share from ${pct(input.codShare, 0)} to ${pct(newCodShare, 0)} with prepaid ` +
      `discounts or coupons. Fewer COD orders means fewer refusals at the door, and the ` +
      `${inr(fees.codFee)} handling fee is not paid on prepaid orders — worth ` +
      `${inr(current - prepaidFloor)} off your floor.`,
    newFloor: prepaidFloor,
    delta: prepaidFloor - current,
    viableNow: prepaidFloor <= band.p90,
  })

  // 2. Lighter packaging, or the next slab down if there is one.
  const lower = nextLowerSlab(input.weightG)
  if (lower) {
    const targetWeight = lower.maxG
    const lighterFloor = refloor({ weightG: targetWeight })
    fixes.push({
      id: 'lighter',
      label: `Get under ${targetWeight} g`,
      detail:
        `You are in the ${slabFor(input.weightG).label} slab at ${inr(slabFor(input.weightG).forward)} ` +
        `forward / ${inr(slabFor(input.weightG).reverse)} reverse. Shedding ` +
        `${input.weightG - targetWeight} g drops you to ${lower.label_en} at ` +
        `${inr(lower.forward)} / ${inr(lower.reverse)}.`,
      newFloor: lighterFloor,
      delta: lighterFloor - current,
      viableNow: lighterFloor <= band.p90,
      caveat: 'Shipping is a step function — only a drop across the slab boundary saves anything.',
    })
  } else {
    const newPackaging = Math.max(0, Math.round(input.packagingCost / 2))
    const lighterFloor = refloor({ packagingCost: newPackaging })
    fixes.push({
      id: 'lighter',
      label: 'Lighter packaging',
      detail:
        `You are already in the cheapest shipping slab (${slabFor(input.weightG).label}), so weight ` +
        `has nothing left to give. Halving packaging from ${inr(input.packagingCost)} to ` +
        `${inr(newPackaging)} per order is what is left.`,
      newFloor: lighterFloor,
      delta: lighterFloor - current,
      viableNow: lighterFloor <= band.p90,
      caveat: 'Thinner packaging can raise the damage rate, which would push returns back up.',
    })
  }

  // 3. Bundle of 2 — the per-order costs are shared, so halve them per unit.
  const bundleOrderFloor = floorRange({ ...input, cogs: input.cogs * 2 }, returnRates).expected
  const bundlePerUnit = bundleOrderFloor / 2
  fixes.push({
    id: 'bundle',
    label: 'Sell as a bundle of 2',
    detail:
      `One parcel, two units. Shipping, packaging, GST and the COD fee are paid once and shared ` +
      `by both, so the per-unit floor falls from ${inr(current)} to ${inr(bundlePerUnit)} — ` +
      `list the pair at ${inr(bundleOrderFloor)}.`,
    newFloor: bundlePerUnit,
    delta: bundlePerUnit - current,
    viableNow: bundlePerUnit <= band.p90,
    caveat:
      'Assumes the pair still ships in the same weight slab. If it tips into the next slab, ' +
      'recompute with the heavier weight.',
  })

  // 4. Reduce COGS by 10%.
  const cheaperCogs = input.cogs * 0.9
  const cogsFloor = refloor({ cogs: cheaperCogs })
  fixes.push({
    id: 'cogs',
    label: 'Reduce product cost by 10%',
    detail:
      `Negotiate your unit cost from ${inr(input.cogs)} to ${inr(cheaperCogs)}. This helps twice: ` +
      `it lowers the floor directly, and it lowers what each unsellable return costs you.`,
    newFloor: cogsFloor,
    delta: cogsFloor - current,
    viableNow: cogsFloor <= band.p90,
  })

  return fixes
}

// ------------------------------------------------------- recommendation (6.4)

export type Stage = 'LAUNCH' | 'RAMP' | 'MATURE' | 'DECLINE'

export const STAGES: readonly Stage[] = ['LAUNCH', 'RAMP', 'MATURE', 'DECLINE'] as const

export const STAGE_LABEL: Record<Stage, string> = {
  LAUNCH: 'Launch',
  RAMP: 'Ramp',
  MATURE: 'Mature',
  DECLINE: 'Decline',
}

export const STAGE_AIM: Record<Stage, string> = {
  LAUNCH: 'Be visible and earn your first ratings, on a thin but positive margin.',
  RAMP: 'Step the price up ₹10–20 a week and keep what works.',
  MATURE: 'Hold the price the steps found. Do not match an undercut on reflex.',
  DECLINE: 'Clear the stock down a markdown ladder that stops at your floor.',
}

export interface RecommendContext {
  /** What the seller is listed at now. */
  currentPrice?: number
  /** The price Launch recommended, for Ramp to step up from. */
  launchPrice?: number
  /** The profit peak the learner found, for Mature to hold. */
  learnedBestPrice?: number
  /** Trigger T3: the five closest listings dropped more than 8% below you. */
  competitorUndercut?: boolean
  /** The median of those five closest listings. */
  competitorMedian?: number
  /** Decline markdowns continue while this is above 4. */
  stockCoverWeeks?: number
  /** How long the product has been in the current stage. */
  weeksInStage?: number
}

export interface Recommendation {
  stage: Stage
  /** Whole rupees. Guaranteed >= floorRange.expected. */
  price: number
  /** Every line contains the actual numbers (spec section 6.4). */
  rationale: string[]
  warnings: string[]
  /** The thin-margin allowance used, for the Show-working panel. */
  minMargin: number
}

/** Spec section 6.4. Never returns a price below `range.expected`. */
export function recommend(
  stage: Stage,
  range: FloorRange,
  band: Band,
  context: RecommendContext = {},
): Recommendation {
  const floorExpected = range.expected
  const minMargin = minMarginFor(floorExpected)
  const floorTarget = floorExpected + minMargin
  const rationale: string[] = []
  const warnings: string[] = []

  // What Launch would list at once the guardrail has had its say — the starting
  // point Ramp, Mature and Decline fall back to when no price is supplied.
  const launchTarget = Math.max(band.p30, floorTarget)

  let target: number
  let ladderStop = false

  switch (stage) {
    case 'LAUNCH': {
      // The raw band target, so the guardrail is the thing that lifts it.
      target = band.p30
      if (band.p30 >= floorTarget) {
        rationale.push(
          `Band 30th percentile is ${inr(band.p30)}; your floor is ${inr(floorExpected)}; ` +
            `so we recommend ${inr(money(band.p30))}.`,
        )
        rationale.push(
          `That clears ${inr(band.p30 - floorExpected)} per sale and still sits below ` +
            `${Math.round(100 - percentileOf(band, band.p30))}% of the market, so buyers will see you.`,
        )
      } else {
        rationale.push(
          `Band 30th percentile is ${inr(band.p30)}; your floor is ${inr(floorExpected)}; ` +
            `so we recommend ${inr(money(floorTarget))} (floor + ${inr(minMargin)}).`,
        )
        rationale.push(
          `The market's cheap end is ${inr(floorExpected - band.p30)} below your floor, so ` +
            `matching it would lose money on every order.`,
        )
      }
      break
    }

    case 'RAMP': {
      const base = context.currentPrice ?? context.launchPrice ?? launchTarget
      const step = base < band.p50 ? 20 : 10
      target = base + step
      rationale.push(
        `You are at ${inr(base)}, ${base < band.p50 ? 'below' : 'at or above'} the band median of ` +
          `${inr(band.p50)}, so this week's step is ${inr(step)} — to ${inr(money(base + step))}.`,
      )
      rationale.push(
        `We keep the step if profit per 1,000 impressions improves by more than 2%, and revert ` +
          `to ${inr(base)} if it falls. That is how the price sensitivity gets learned without ` +
          `any price-vs-sales history.`,
      )
      break
    }

    case 'MATURE': {
      const held = context.learnedBestPrice ?? context.currentPrice ?? launchTarget
      target = held
      rationale.push(
        context.learnedBestPrice !== undefined
          ? `Hold ${inr(held)} — the profit peak the ramp-stage steps found.`
          : `Hold ${inr(held)}. Once the ramp finds a profit peak, that becomes the price to hold.`,
      )
      if (context.competitorUndercut) {
        const rival = context.competitorMedian
        const lossIfMatched = rival !== undefined ? floorExpected - rival : undefined
        rationale.push(
          rival !== undefined
            ? `The five closest listings have dropped to ${inr(rival)}. Your floor is ` +
              `${inr(floorExpected)}, so matching them would ` +
              (lossIfMatched !== undefined && lossIfMatched > 0
                ? `lose ${inr(lossIfMatched)} per order.`
                : `still clear ${inr(rival - floorExpected)} per order — but check it first.`)
            : `A competitor has undercut you. Re-check your floor of ${inr(floorExpected)} before ` +
              `you react.`,
        )
        rationale.push(
          `Offer a bundle or a variant at a lower per-unit price instead of cutting this listing — ` +
            `a bundle shares the ${inr(range.results.expected.overheadPerCleanSale)} of per-order ` +
            `overhead across two units.`,
        )
        warnings.push('A competitor has undercut you. Re-check your floor before matching.')
      }
      break
    }

    case 'DECLINE': {
      ladderStop = true
      const base = context.currentPrice ?? context.learnedBestPrice ?? launchTarget
      const weeks = context.weeksInStage ?? 0
      const stockCover = context.stockCoverWeeks ?? Number.POSITIVE_INFINITY
      const steps = stockCover > 4 ? Math.floor(weeks / 2) : 0
      const laddered = base * 0.95 ** steps
      target = laddered
      rationale.push(
        steps > 0
          ? `${steps} markdown${steps === 1 ? '' : 's'} of 5% from ${inr(base)} after ${weeks} ` +
            `weeks in decline brings you to ${inr(money(laddered))}.`
          : stockCover > 4
            ? `The ladder cuts 5% every 2 weeks. You are ${weeks} week${weeks === 1 ? '' : 's'} in, ` +
              `so the price stays at ${inr(base)} for now.`
            : `Stock cover is ${stockCover} weeks, which is under 4 — no markdown needed; the stock ` +
              `will clear on its own.`,
      )
      if (laddered < floorExpected) {
        rationale.push(
          `The ladder wanted ${inr(money(laddered))}, which is below your floor of ` +
            `${inr(floorExpected)}. It stops here: clearing stock below the floor costs you more ` +
            `than holding it.`,
        )
      } else {
        rationale.push(
          `Your floor is ${inr(floorExpected)}, so there is still ` +
            `${inr(laddered - floorExpected)} of room before the ladder has to stop.`,
        )
      }
      break
    }
  }

  const guarded = applyGuardrail(target, range, warnings, ladderStop)
  const price = money(guarded)

  // Rounding to whole rupees must not push the price under the floor.
  const safePrice = price < floorExpected ? Math.ceil(floorExpected) : price

  rationale.push(
    `Floor used: ${inr(floorExpected, 2)} at a ${pct(range.returnRates.expected, 0)} return rate. ` +
      `At ${inr(safePrice)} you clear ${inr(safePrice - floorExpected)} per clean sale.`,
  )

  return { stage, price: safePrice, rationale, warnings, minMargin }
}

/** All four stages at once — what Screen 2's stage cards render. */
export function recommendAllStages(
  range: FloorRange,
  band: Band,
  context: RecommendContext = {},
): Record<Stage, Recommendation> {
  return {
    LAUNCH: recommend('LAUNCH', range, band, context),
    RAMP: recommend('RAMP', range, band, context),
    MATURE: recommend('MATURE', range, band, context),
    DECLINE: recommend('DECLINE', range, band, context),
  }
}
