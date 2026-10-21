/**
 * Price step planner, the honest learner (MVP spec v2, 7.9). Pure, no React.
 *
 * "Try ₹10 more" records the old and new price and the start date. The step
 * is judged only once there is a report from before it and one from after
 * it, each covering at least 7 days with at least 20 clean sales. Then:
 *
 *   profit per day = clean sales × keep ÷ days
 *
 * and the "after" figure is divided by the whole catalogue's order trend
 * over the same two periods (the other products), so a festive rush or a
 * slow week isn't credited to the price. That trend is only used when the
 * other products have at least 20 orders in each period, and is held to
 * 0.67–1.5 so one odd week can't swing the verdict.
 *
 * A step is only judged on reports that actually show it: the "before"
 * report's average price within ₹1 of the old price and the "after"
 * report's within ₹1 of the new one. Otherwise (the price wasn't changed on
 * Meesho yet, or the report straddles the change) it is too early. Verdicts:
 *
 *   KEEP        at least 10% better
 *   GO_BACK     at least 10% worse
 *   TOO_EARLY   not enough data, or less than a 10% difference either way
 *
 * The seller never sees an elasticity number; only the verdict and the two
 * profit-per-day figures behind it.
 */

export const MIN_CLEAN_SALES = 20
export const MIN_DAYS = 7
export const VERDICT_THRESHOLD = 0.1
/** A report's average price this close to the step's price shows the step, ₹. */
export const PRICE_SEEN_TOLERANCE = 1
/** The catalogue trend needs this many orders of other products in each period… */
export const MIN_CATALOGUE_ORDERS = 20
/** …and is held inside these bounds. */
export const CATALOGUE_RATIO_MIN = 0.67
export const CATALOGUE_RATIO_MAX = 1.5

export type StepVerdict = 'KEEP' | 'GO_BACK' | 'TOO_EARLY'

export interface StepPeriod {
  cleanSales: number
  days: number
  /** What each clean sale kept in that period, ₹. */
  keep: number
  /** The report's average selling price, ₹; null when it has no price column. */
  avgPrice?: number | null
}

export interface StepJudgement {
  verdict: StepVerdict
  /** Why it is too early, when it is. */
  reason: 'NO_AFTER' | 'NO_BEFORE' | 'PRICE_NOT_SEEN' | 'FEW_SALES' | 'SHORT_PERIOD' | 'SMALL_CHANGE' | null
  /** ₹ a day in each period; after is adjusted for the catalogue trend. */
  profitPerDayBefore: number | null
  profitPerDayAfter: number | null
  /** after ÷ before − 1. */
  change: number | null
  /** The catalogue's orders a day after ÷ before (1 when there are no other products). */
  catalogueRatio: number
}

export function profitPerDay(p: StepPeriod): number {
  return (p.cleanSales * p.keep) / p.days
}

export function judgeStep(args: {
  before: StepPeriod | null
  after: StepPeriod | null
  /** Other products' orders a day, after ÷ before. */
  catalogueRatio?: number | null
  /** The step's prices. When given, each report must show its price (PRICE_SEEN_TOLERANCE). */
  prices?: { oldPrice: number; newPrice: number }
}): StepJudgement {
  const ratio =
    args.catalogueRatio && args.catalogueRatio > 0
      ? Math.min(CATALOGUE_RATIO_MAX, Math.max(CATALOGUE_RATIO_MIN, args.catalogueRatio))
      : 1
  const early = (reason: StepJudgement['reason']): StepJudgement => ({
    verdict: 'TOO_EARLY',
    reason,
    profitPerDayBefore: args.before ? profitPerDay(args.before) : null,
    profitPerDayAfter: args.after ? profitPerDay(args.after) / ratio : null,
    change: null,
    catalogueRatio: ratio,
  })
  const { before, after } = args
  if (!before) return early('NO_BEFORE')
  if (!after) return early('NO_AFTER')
  if (args.prices) {
    const shows = (p: StepPeriod, price: number) => p.avgPrice != null && Math.abs(p.avgPrice - price) <= PRICE_SEEN_TOLERANCE
    if (!shows(before, args.prices.oldPrice) || !shows(after, args.prices.newPrice)) return early('PRICE_NOT_SEEN')
  }
  if (before.days < MIN_DAYS || after.days < MIN_DAYS) return early('SHORT_PERIOD')
  if (before.cleanSales < MIN_CLEAN_SALES || after.cleanSales < MIN_CLEAN_SALES) return early('FEW_SALES')

  const b = profitPerDay(before)
  const a = profitPerDay(after) / ratio
  // A loss-making "before" makes a ratio meaningless; compare the gain against its size instead.
  const change = b !== 0 ? (a - b) / Math.abs(b) : a > 0 ? Number.POSITIVE_INFINITY : a < 0 ? Number.NEGATIVE_INFINITY : 0
  const verdict: StepVerdict = change >= VERDICT_THRESHOLD ? 'KEEP' : change <= -VERDICT_THRESHOLD ? 'GO_BACK' : 'TOO_EARLY'
  return {
    verdict,
    reason: verdict === 'TOO_EARLY' ? 'SMALL_CHANGE' : null,
    profitPerDayBefore: b,
    profitPerDayAfter: a,
    change,
    catalogueRatio: ratio,
  }
}
