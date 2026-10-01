/**
 * The six repricing triggers (spec section 6.6).
 *
 * This is what makes Sahi Daam a monitor rather than a calculator. A seller
 * prices once and then the world moves underneath them: returns creep up, the
 * festive season lifts RTO, a neighbour undercuts, fabric gets dearer. Each
 * trigger watches one of those and says what it costs in rupees.
 *
 * Every trigger is evaluated per simulated week, and on demand from Screen 4.
 *
 * Pure, framework-free. No React imports.
 */
import { type Band, nearestListings, percentileOf, quantile } from './band'
import { type FloorInput, type FloorRange, floor as computeFloor } from './floor'
import { inr, pct } from './format'
import { minMarginFor } from './recommend'
import { type MonthKey, peakSeasonIndexBetween, seasonIndexForDate } from './season'

export type TriggerId = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6'

export type Severity = 'info' | 'warn' | 'critical'

export interface Alert {
  id: TriggerId
  week: number
  severity: Severity
  title: string
  /** One or two sentences, always carrying the actual numbers. */
  detail: string
  /** What the seller should do about it (spec section 6.6's action column). */
  action: string
  /** Everything the nudge templates interpolate. */
  numbers: Record<string, number | string>
  /**
   * The product state this alert is about, so Screen 4's "Daam check karein"
   * button can deep-link to Screen 2 with that week's numbers loaded.
   */
  restore?: {
    price?: number
    cogs?: number
    month?: MonthKey
    returnRateExpected?: number
  }
}

/**
 * Thresholds, named so the tests can probe either side of each one rather than
 * hard-coding a magic number twice.
 *
 * Note which comparison each spec rule uses: T1 and T2 are stated as ">=", so
 * they fire exactly AT the threshold; T3 and T5 are stated as "> 8%" and
 * "> 5%", so the threshold value itself does NOT fire. Test 7 checks each
 * boundary the way its own rule is written.
 */
export const THRESHOLDS = {
  /** T1: last-2-week return rate >= baseline + 5 percentage points. */
  T1_RETURN_RATE_PP: 0.05,
  /** T2: season index for the next 2 weeks >= 1.4. */
  T2_SEASON_INDEX: 1.4,
  /** T3: nearest-5 median more than 8% below your price. */
  T3_UNDERCUT: 0.08,
  /** T4: impressions down 20% or more against last week. */
  T4_IMPRESSION_DROP: 0.2,
  /** T5: COGS moved by more than 5%. */
  T5_COGS_SHIFT: 0.05,
} as const

export const TRIGGER_TITLE: Record<TriggerId, string> = {
  T1: 'Returns are climbing',
  T2: 'Festive RTO is coming',
  T3: 'A competitor has undercut you',
  T4: 'You have dropped out of view',
  T5: 'Your product cost changed',
  T6: 'You changed your price',
}

export interface TriggerContext {
  week: number
  /** The Monday of this week, for the season lookahead. */
  date: Date
  input: FloorInput
  range: FloorRange
  band: Band
  /** What the seller is listed at right now. */
  price: number

  // --- T1 ---
  /** The return rate the floor was originally built on. */
  baselineReturnRate?: number
  /** Observed weekly return rates, most recent last. T1 reads the last two. */
  recentReturnRates?: number[]

  // --- T2 ---
  /** Overrides the date-derived lookahead; Screen 4's Fire button uses it. */
  seasonIndexAhead?: number

  // --- T3 ---
  /**
   * The listings you are actually competing with, by id — normally the five
   * nearest at the time you last set your price.
   *
   * This matters more than it looks. "The five closest listings right now" is
   * self-correcting: whatever your price is, five listings will be clustered
   * near it, so their median can never sit far below you and the trigger could
   * never fire in a dense band. An undercut is the five sellers you were
   * competing with cutting THEIR prices, which is only visible if you remember
   * who they were. Defaults to the five nearest now when no cohort is given.
   */
  competitorCohort?: string[]
  /**
   * What that cohort's median was when you last set your price.
   *
   * Without it the trigger also fires when the gap opens because YOU priced
   * upwards — and then announces "the listings closest to yours have dropped",
   * which is simply untrue. Being above your old neighbours is a visibility
   * problem, and T4 is the trigger for that.
   */
  competitorReferenceMedian?: number

  // --- T4 ---
  impressions?: number
  previousImpressions?: number
  categoryTrend?: number
  previousCategoryTrend?: number

  // --- T5 ---
  previousCogs?: number

  // --- T6 ---
  manualPriceChange?: { from: number; to: number }
}

/** The floor for this product at one specific return rate. */
function floorAtReturnRate(input: FloorInput, returnRate: number): number {
  return computeFloor({ ...input, returnRate }).floor
}

/** The floor for this product at one specific season index. */
function floorAtSeason(input: FloorInput, seasonIndex: number): number {
  return computeFloor({ ...input, seasonIndex }).floor
}

/** Loss-shaped alerts get louder when the current price is already underwater. */
function severityForFloor(price: number, floorValue: number): Severity {
  return price < floorValue ? 'critical' : 'warn'
}

// ----------------------------------------------------------------------- T1

/** Return rate climbs: last-2-week return rate >= baseline + 5pp. */
export function checkT1(ctx: TriggerContext): Alert | null {
  const baseline = ctx.baselineReturnRate ?? ctx.input.returnRate
  const recent = ctx.recentReturnRates ?? []
  if (recent.length < 2) return null

  const lastTwo = recent.slice(-2)
  const observed = (lastTwo[0]! + lastTwo[1]!) / 2
  if (observed < baseline + THRESHOLDS.T1_RETURN_RATE_PP) return null

  const floorOld = floorAtReturnRate(ctx.input, baseline)
  const floorNew = floorAtReturnRate(ctx.input, observed)
  const suggested = Math.round(floorNew + minMarginFor(floorNew))
  const profit = ctx.price - floorNew

  return {
    id: 'T1',
    week: ctx.week,
    severity: severityForFloor(ctx.price, floorNew),
    title: TRIGGER_TITLE.T1,
    detail:
      `Returns over the last two weeks averaged ${pct(observed)}, against a baseline of ` +
      `${pct(baseline)}. Every extra return costs you reverse shipping and, often, the ` +
      `product itself — so your floor has moved from ${inr(floorOld)} to ${inr(floorNew)}.`,
    action:
      `Your floor moved from ${inr(floorOld)} to ${inr(floorNew)}. Raise price to ` +
      `${inr(suggested)} or fix the listing (size chart, photos).`,
    numbers: {
      returnOld: Math.round(baseline * 1000) / 10,
      returnNew: Math.round(observed * 1000) / 10,
      floorOld: Math.round(floorOld),
      floorNew: Math.round(floorNew),
      price: Math.round(ctx.price),
      suggested,
      profit: Math.round(profit),
      loss: Math.round(Math.abs(Math.min(0, profit))),
    },
    restore: { price: Math.round(ctx.price), returnRateExpected: observed },
  }
}

// ----------------------------------------------------------------------- T2

/** Festive RTO spike: the season index for the next 2 weeks is >= 1.4. */
export function checkT2(ctx: TriggerContext): Alert | null {
  const twoWeeksOut = new Date(ctx.date.getTime())
  twoWeeksOut.setDate(twoWeeksOut.getDate() + 14)

  const ahead = ctx.seasonIndexAhead ?? peakSeasonIndexBetween(ctx.date, twoWeeksOut)
  if (ahead < THRESHOLDS.T2_SEASON_INDEX) return null

  const now = ctx.input.seasonIndex ?? seasonIndexForDate(ctx.date)
  // ...and only if it is actually still coming. Deep in the festive season the
  // index ahead equals the index now, and the alert would read "will lift your
  // floor from ₹349 to ₹349" — a warning about something that has already
  // happened. "Reprice before the peak" is only useful before the peak.
  if (ahead <= now) return null

  const floorOld = floorAtSeason(ctx.input, now)
  const floorNew = floorAtSeason(ctx.input, ahead)
  const profit = ctx.price - floorNew

  return {
    id: 'T2',
    week: ctx.week,
    severity: severityForFloor(ctx.price, floorNew),
    title: TRIGGER_TITLE.T2,
    detail:
      `RTO runs ${ahead}× its usual level in the next two weeks. More parcels refused at the ` +
      `door means more forward and reverse shipping paid on orders that never become a sale, ` +
      `so your floor rises from ${inr(floorOld)} to ${inr(floorNew)} before you change anything.`,
    action: `Festive RTO will lift your floor from ${inr(floorOld)} to ${inr(floorNew)}. Reprice before the peak.`,
    numbers: {
      seasonIndex: ahead,
      floorOld: Math.round(floorOld),
      floorNew: Math.round(floorNew),
      price: Math.round(ctx.price),
      profit: Math.round(profit),
      loss: Math.round(Math.abs(Math.min(0, profit))),
    },
    restore: { price: Math.round(ctx.price) },
  }
}

// ----------------------------------------------------------------------- T3

/** Competitor undercut: the median of the 5 closest listings is >8% under you. */
export function checkT3(ctx: TriggerContext): Alert | null {
  if (ctx.price <= 0) return null

  const cohort = ctx.competitorCohort
  const rivals =
    cohort && cohort.length > 0
      ? ctx.band.listings.filter((l) => cohort.includes(l.id))
      : nearestListings(ctx.band, ctx.price)
  if (rivals.length === 0) return null

  const rivalMedian = quantile(
    rivals.map((l) => l.price).sort((a, b) => a - b),
    0.5,
  )
  // They have to have actually moved down, not just been left behind.
  if (
    ctx.competitorReferenceMedian !== undefined &&
    rivalMedian >= ctx.competitorReferenceMedian
  ) {
    return null
  }

  const drop = (ctx.price - rivalMedian) / ctx.price
  if (drop <= THRESHOLDS.T3_UNDERCUT) return null

  const floorValue = ctx.range.expected
  const marginIfMatched = rivalMedian - floorValue
  const safe = marginIfMatched >= 0

  return {
    id: 'T3',
    week: ctx.week,
    severity: safe ? 'info' : 'warn',
    title: TRIGGER_TITLE.T3,
    detail:
      `The five listings closest to yours now sit at a median of ${inr(rivalMedian)} — ` +
      `${pct(drop)} below your ${inr(ctx.price)}. ` +
      (safe
        ? `Matching them is still above your floor of ${inr(floorValue)}.`
        : `Your floor is ${inr(floorValue)}, so matching them would put you underwater.`),
    action: safe
      ? `Re-check your floor (${inr(floorValue)}) before matching. Matching to ${inr(rivalMedian)} is safe — you would still clear ${inr(marginIfMatched)} per order.`
      : `Re-check your floor (${inr(floorValue)}) before matching. Matching to ${inr(rivalMedian)} would lose ${inr(Math.abs(marginIfMatched))} per order.`,
    numbers: {
      floor: Math.round(floorValue),
      competitorPrice: Math.round(rivalMedian),
      rivals: rivals.length,
      price: Math.round(ctx.price),
      dropPct: Math.round(drop * 1000) / 10,
      lossIfMatched: Math.round(Math.abs(Math.min(0, marginIfMatched))),
      profitIfMatched: Math.round(Math.max(0, marginIfMatched)),
      safe: safe ? 1 : 0,
    },
    restore: { price: Math.round(ctx.price) },
  }
}

// ----------------------------------------------------------------------- T4

/** Priced out of view: impressions down >=20% while the category is not. */
export function checkT4(ctx: TriggerContext): Alert | null {
  const now = ctx.impressions
  const before = ctx.previousImpressions
  if (now === undefined || before === undefined || before <= 0) return null

  const drop = (before - now) / before
  if (drop < THRESHOLDS.T4_IMPRESSION_DROP) return null

  // Only a problem if the category itself did not fall — otherwise everyone is
  // down and the price is not the reason.
  const trend = ctx.categoryTrend ?? 1
  const previousTrend = ctx.previousCategoryTrend ?? 1
  if (trend < previousTrend) return null

  const percentile = percentileOf(ctx.band, ctx.price)

  return {
    id: 'T4',
    week: ctx.week,
    severity: 'warn',
    title: TRIGGER_TITLE.T4,
    detail:
      `Your listing was shown ${pct(drop)} less than last week, while demand in the category ` +
      `held steady. At ${inr(ctx.price)} you sit at the ${Math.round(percentile)}th percentile ` +
      `of the band — above most of the market, which is where impressions go quiet.`,
    action: `You have moved out of the visible band (now at the ${Math.round(percentile)}th percentile).`,
    numbers: {
      impressionsDrop: Math.round(drop * 1000) / 10,
      impressions: Math.round(now),
      previousImpressions: Math.round(before),
      percentile: Math.round(percentile),
      price: Math.round(ctx.price),
    },
    restore: { price: Math.round(ctx.price) },
  }
}

// ----------------------------------------------------------------------- T5

/** COGS shift: your unit cost moved by more than 5%. */
export function checkT5(ctx: TriggerContext): Alert | null {
  const before = ctx.previousCogs
  if (before === undefined || before <= 0) return null

  const now = ctx.input.cogs
  const change = (now - before) / before
  if (Math.abs(change) <= THRESHOLDS.T5_COGS_SHIFT) return null

  const floorOld = computeFloor({ ...ctx.input, cogs: before }).floor
  const floorNew = ctx.range.expected
  const profit = ctx.price - floorNew

  return {
    id: 'T5',
    week: ctx.week,
    severity: severityForFloor(ctx.price, floorNew),
    title: TRIGGER_TITLE.T5,
    detail:
      `Your unit cost went from ${inr(before)} to ${inr(now)}, a change of ${pct(Math.abs(change))}. ` +
      `That moves the floor twice over: the cost itself, and what every unsellable return ` +
      `is worth. Your floor is now ${inr(floorNew)}, not ${inr(floorOld)}.`,
    action: `Your cost changed; your floor is now ${inr(floorNew)}.`,
    numbers: {
      cogsOld: Math.round(before),
      cogsNew: Math.round(now),
      cogsChangePct: Math.round(Math.abs(change) * 1000) / 10,
      direction: change > 0 ? 'up' : 'down',
      floorOld: Math.round(floorOld),
      floorNew: Math.round(floorNew),
      price: Math.round(ctx.price),
      profit: Math.round(profit),
      loss: Math.round(Math.abs(Math.min(0, profit))),
    },
    restore: { price: Math.round(ctx.price), cogs: now },
  }
}

// ----------------------------------------------------------------------- T6

/** Repriced without checking: any manual price change at all. */
export function checkT6(ctx: TriggerContext): Alert | null {
  const change = ctx.manualPriceChange
  if (!change || change.from === change.to) return null

  const floorValue = ctx.range.expected
  const profit = change.to - floorValue
  const losing = profit < 0

  return {
    id: 'T6',
    week: ctx.week,
    severity: losing ? 'critical' : 'info',
    title: TRIGGER_TITLE.T6,
    detail:
      `You moved the price from ${inr(change.from)} to ${inr(change.to)}. Your floor is ` +
      `${inr(floorValue)}, so ` +
      (losing
        ? `every order at the new price takes ${inr(Math.abs(profit))} out of your pocket.`
        : `every order at the new price clears ${inr(profit)}.`),
    action: losing
      ? `You changed the price to ${inr(change.to)}. Your floor is ${inr(floorValue)}, so you now lose ${inr(Math.abs(profit))} per order.`
      : `You changed the price to ${inr(change.to)}. Your floor is ${inr(floorValue)}, so you now make ${inr(profit)} per order.`,
    numbers: {
      priceOld: Math.round(change.from),
      price: Math.round(change.to),
      floor: Math.round(floorValue),
      profit: Math.round(profit),
      loss: Math.round(Math.abs(Math.min(0, profit))),
      losing: losing ? 1 : 0,
    },
    restore: { price: Math.round(change.to) },
  }
}

// --------------------------------------------------------------------- all six

const CHECKS: Record<TriggerId, (ctx: TriggerContext) => Alert | null> = {
  T1: checkT1,
  T2: checkT2,
  T3: checkT3,
  T4: checkT4,
  T5: checkT5,
  T6: checkT6,
}

export const TRIGGER_IDS: readonly TriggerId[] = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'] as const

/** Every trigger that fires for this context, in T1–T6 order. */
export function evaluateTriggers(ctx: TriggerContext): Alert[] {
  const out: Alert[] = []
  for (const id of TRIGGER_IDS) {
    const alert = CHECKS[id](ctx)
    if (alert) out.push(alert)
  }
  return out
}

/** One trigger by id — what Screen 4's "Fire T1…T6" buttons call. */
export function checkTrigger(id: TriggerId, ctx: TriggerContext): Alert | null {
  return CHECKS[id](ctx)
}
