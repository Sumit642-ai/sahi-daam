import { describe, expect, it } from 'vitest'

import {
  BASELINE_MONTH,
  MAX_RTO,
  MONTH_KEYS,
  getSeasonMonth,
  listSeasonMonths,
  peakSeasonIndexBetween,
  seasonIndex,
  seasonIndexForDate,
  seasonalRto,
} from '../src/engine/season'

/**
 * Supporting tests for season.ts. The numbered floor-under-seasonality test
 * (spec section 10, test 3) lives in floor.test.ts; this file pins the index
 * table and the relative-to-baseline contract from spec section 5.4.
 */
describe('season index table (spec section 5.4)', () => {
  it('matches every value in the spec table', () => {
    expect(seasonIndex('Nov')).toBe(1.867) // Unicommerce 39.2 / 21.0
    expect(seasonIndex('Oct')).toBe(1.6) //  ASSUMPTION (festive ramp)
    expect(seasonIndex('Dec')).toBe(1.4) //  ASSUMPTION
    expect(seasonIndex('Jan')).toBe(1.219) // Unicommerce 25.6 / 21.0
    expect(seasonIndex('Feb')).toBe(1.1) //  ASSUMPTION
    for (const key of ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'] as const) {
      expect(seasonIndex(key)).toBe(1)
    }
  })

  it('covers all twelve months in calendar order', () => {
    expect(MONTH_KEYS).toEqual([
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ])
    expect(listSeasonMonths()).toHaveLength(12)
  })

  it('normalises against March, which is therefore exactly 1.00', () => {
    expect(BASELINE_MONTH).toBe('Mar')
    expect(seasonIndex(BASELINE_MONTH)).toBe(1)
  })

  it('derives the cited indices from the underlying industry RTO figures', () => {
    expect(seasonIndex('Nov')).toBeCloseTo(39.2 / 21.0, 3)
    expect(seasonIndex('Jan')).toBeCloseTo(25.6 / 21.0, 3)
  })

  it('carries a source for every month', () => {
    for (const month of listSeasonMonths()) {
      expect(month.source.length).toBeGreaterThan(0)
    }
    expect(getSeasonMonth('Nov').source).toMatch(/Unicommerce/)
    expect(getSeasonMonth('Oct').source).toMatch(/ASSUMPTION/)
  })

  it('accepts a 0-based month number, as Date.getMonth() returns', () => {
    expect(seasonIndex(10)).toBe(1.867)
    expect(seasonIndexForDate(new Date(2026, 10, 8))).toBe(1.867) // Diwali 2026
    expect(seasonIndexForDate(new Date(2026, 6, 6))).toBe(1) // journey week 1
  })

  it('throws on an unknown month rather than defaulting to 1.0', () => {
    expect(() => seasonIndex(12)).toThrow(/Unknown month/)
    // @ts-expect-error — guarding the runtime path, not the type
    expect(() => seasonIndex('Smarch')).toThrow(/Unknown month/)
  })
})

describe('seasonalRto — relative to the seller’s own baseline', () => {
  it('multiplies the seller’s baseline rather than replacing it', () => {
    expect(seasonalRto(0.17, 1.867)).toBeCloseTo(0.31739, 5)
    expect(seasonalRto(0.1, 1.867)).toBeCloseTo(0.1867, 5)
  })

  it('defaults to leaving the baseline alone', () => {
    expect(seasonalRto(0.17)).toBe(0.17)
  })

  it('caps at 0.90', () => {
    expect(MAX_RTO).toBe(0.9)
    expect(seasonalRto(0.6, 1.867)).toBe(0.9)
  })
})

describe('peakSeasonIndexBetween — for trigger T2’s two-week lookahead', () => {
  it('finds the peak across a month boundary', () => {
    // Late September into early October: the festive ramp starts.
    expect(peakSeasonIndexBetween(new Date(2026, 8, 28), new Date(2026, 9, 11))).toBe(1.6)
  })

  it('returns the single month’s index when the span stays inside it', () => {
    expect(peakSeasonIndexBetween(new Date(2026, 6, 6), new Date(2026, 6, 19))).toBe(1)
  })

  it('does not care which end of the span comes first', () => {
    const a = new Date(2026, 9, 26)
    const b = new Date(2026, 10, 8)
    expect(peakSeasonIndexBetween(a, b)).toBe(peakSeasonIndexBetween(b, a))
    expect(peakSeasonIndexBetween(a, b)).toBe(1.867)
  })
})
