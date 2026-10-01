/**
 * Seasonal RTO index (spec section 5.4 / 6.1).
 *
 * Seasonality is applied RELATIVE to the seller's own baseline RTO, never as an
 * absolute RTO:
 *
 *     index  = month industry RTO / March industry RTO
 *     rto    = min(baselineRto * index, 0.90)
 *
 * So a seller whose own pincode mix gives 17% RTO in March sees
 * 17% * 1.867 = 31.7% at the November festive peak, while a seller at 10% sees
 * 18.7%. The index carries the shape of the season; the level stays the
 * seller's own.
 *
 * Pure, framework-free. No React imports.
 */
import {
  type MonthKey,
  type SeasonMonth,
  seasonBaselineMonth,
  seasonMaxRto,
  seasonMonths,
} from '../data'

export type { MonthKey, SeasonMonth }

/** Jan..Dec in calendar order. */
export const MONTH_KEYS: readonly MonthKey[] = seasonMonths.map((m) => m.key)

/** The month the index is normalised against (March 2026, index 1.00). */
export const BASELINE_MONTH: MonthKey = seasonBaselineMonth

/** Hard cap on RTO after the index is applied (spec section 6.1). */
export const MAX_RTO = seasonMaxRto

const byKey = new Map<MonthKey, SeasonMonth>(seasonMonths.map((m) => [m.key, m]))
const byIndex = new Map<number, SeasonMonth>(seasonMonths.map((m) => [m.monthIndex, m]))

/** A month key ('Nov') or a 0-based month number, as Date.getMonth() returns. */
export type MonthRef = MonthKey | number

/**
 * The full season row for a month, including its source string.
 * Throws on an unknown month — a bad month is a bug, not something to default.
 */
export function getSeasonMonth(month: MonthRef): SeasonMonth {
  const found = typeof month === 'number' ? byIndex.get(month) : byKey.get(month)
  if (!found) {
    throw new Error(
      `Unknown month ${JSON.stringify(month)}. Expected one of ${MONTH_KEYS.join(', ')} ` +
        `or a 0-based month number 0..11.`,
    )
  }
  return found
}

/** The RTO season index for a month, e.g. 1.867 for November. */
export function seasonIndex(month: MonthRef): number {
  return getSeasonMonth(month).index
}

/** The season index for a calendar date, from its month. */
export function seasonIndexForDate(date: Date): number {
  return seasonIndex(date.getMonth())
}

/**
 * Apply the index to a seller's own baseline RTO, capped at MAX_RTO.
 * This is the one place the cap lives; floor.ts calls through to it.
 */
export function seasonalRto(baselineRto: number, index = 1): number {
  return Math.min(baselineRto * index, MAX_RTO)
}

/** Every month with its index and source, for the Assumptions screen. */
export function listSeasonMonths(): SeasonMonth[] {
  return [...seasonMonths]
}

/**
 * The highest index over a span of dates — used by trigger T2 ("season index for
 * the next 2 weeks >= 1.4"), which has to look across a month boundary.
 */
export function peakSeasonIndexBetween(from: Date, to: Date): number {
  if (to < from) return peakSeasonIndexBetween(to, from)
  let peak = seasonIndexForDate(from)
  // Step a day at a time: the spans involved are weeks, so this stays cheap and
  // cannot skip a short month the way month-arithmetic can.
  const cursor = new Date(from.getTime())
  while (cursor <= to) {
    peak = Math.max(peak, seasonIndexForDate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return peak
}
