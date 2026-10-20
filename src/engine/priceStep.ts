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
 * slow week isn't credited to the price. Verdicts:
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

export type StepVerdict = 'KEEP' | 'GO_BACK' | 'TOO_EARLY'

export interface StepPeriod {
  cleanSales: number
  days: number
  /** What each clean sale kept in that period, ₹. */
  keep: number
}

export interface StepJudgement {
  verdict: StepVerdict
  /** Why it is too early, when it is. */
  reason: 'NO_AFTER' | 'NO_BEFORE' | 'FEW_SALES' | 'SHORT_PERIOD' | 'SMALL_CHANGE' | null
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
}): StepJudgement {
  const ratio = args.catalogueRatio && args.catalogueRatio > 0 ? args.catalogueRatio : 1
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
