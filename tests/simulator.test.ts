import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  IMPROVEMENT_THRESHOLD,
  type WeekObservation,
  createLearner,
  estimateElasticity,
  observeWeek,
  profitPer1000Impressions,
  stepSizeFor,
} from '../src/engine/learner'
import { runSimulation, weekDate } from '../src/engine/simulator'

// ---------------------------------------------------------------------------
// Spec section 10, test 8 — Simulator determinism
// ---------------------------------------------------------------------------

describe('test 8 — simulator determinism and the three strategies', () => {
  const a = runSimulation()
  const b = runSimulation()

  it('produces byte-identical output across two runs', () => {
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('runs all three strategies for all 26 weeks', () => {
    expect(a.sahiDaam.weeks).toHaveLength(26)
    expect(a.sellerInstinct.weeks).toHaveLength(26)
    expect(a.meeshoRange.weeks).toHaveLength(26)
    expect(a.sahiDaam.weeks.map((w) => w.week)).toEqual(
      Array.from({ length: 26 }, (_, i) => i + 1),
    )
  })

  it('ends Sahi Daam ahead of both baselines on cumulative profit', () => {
    const sahi = a.sahiDaam.weeks[25]!.cumulativeProfit
    expect(sahi).toBeGreaterThan(a.sellerInstinct.weeks[25]!.cumulativeProfit)
    expect(sahi).toBeGreaterThan(a.meeshoRange.weeks[25]!.cumulativeProfit)
  })

  it('shows on the seller floor that both baselines still make money — just less', () => {
    // At ₹300 or the ₹318 band median, both sit above the ₹271 seller floor in
    // quiet weeks. The case for Sahi Daam is the gap, not a loss.
    expect(a.sellerInstinct.summary.totalProfit).toBeGreaterThan(0)
    expect(a.meeshoRange.summary.totalProfit).toBeGreaterThan(0)
  })

  it('never lets Sahi Daam price below its floor', () => {
    expect(a.sahiDaam.summary.weeksBelowFloor).toBe(0)
  })

  it('keeps Meesho range on the band median every week, undercut included', () => {
    for (const w of a.meeshoRange.weeks) expect(w.price).toBe(Math.round(w.bandP50))
  })

  it('gives both strategies the identical world', () => {
    // Same scripted calendar, same band, same seasonal lift, same costs.
    for (let i = 0; i < 26; i += 1) {
      const sahi = a.sahiDaam.weeks[i]!
      for (const other of [a.sellerInstinct.weeks[i]!, a.meeshoRange.weeks[i]!]) {
        expect(other.date).toBe(sahi.date)
        expect(other.cogs).toBe(sahi.cogs)
        expect(other.seasonIndex).toBe(sahi.seasonIndex)
        expect(other.bandP50).toBeCloseTo(sahi.bandP50, 6)
      }
    }
  })

  it('starts on Monday 6 July 2026 and reaches the festive peak in weeks 16–21', () => {
    expect(a.sahiDaam.weeks[0]!.date).toBe('2026-07-06')
    expect(weekDate(1).getDay()).toBe(1) // Monday
    // Diwali is 8 November 2026; the week containing it must be inside 16–21.
    const diwaliWeek = a.sahiDaam.weeks.find(
      (w) => w.date <= '2026-11-08' && weekDate(w.week + 1) > new Date(2026, 10, 8),
    )!
    expect(diwaliWeek.week).toBeGreaterThanOrEqual(16)
    expect(diwaliWeek.week).toBeLessThanOrEqual(21)
    // Festive RTO really does lift the floor.
    const festive = a.sahiDaam.weeks.filter((w) => w.week >= 16 && w.week <= 21)
    const quiet = a.sahiDaam.weeks.filter((w) => w.week <= 8)
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
    expect(avg(festive.map((w) => w.seasonIndex))).toBeGreaterThan(
      avg(quiet.map((w) => w.seasonIndex)),
    )
  })

  it('moves through the scripted stages', () => {
    const stageAt = (week: number) => a.sahiDaam.weeks[week - 1]!.stage
    expect(stageAt(1)).toBe('LAUNCH')
    expect(stageAt(3)).toBe('LAUNCH')
    expect(stageAt(4)).toBe('RAMP')
    expect(stageAt(22)).toBe('DECLINE')
    expect(stageAt(26)).toBe('DECLINE')
    expect(a.sahiDaam.weeks.some((w) => w.stage === 'MATURE')).toBe(true)
  })

  it('applies the scripted events: the cost rise and the size complaints', () => {
    expect(a.sahiDaam.weeks[12]!.cogs).toBe(150) // week 13
    expect(a.sahiDaam.weeks[13]!.cogs).toBe(159) // week 14, +6%
    // Weeks 16-18 run 6pp hotter on returns than the quiet weeks.
    const quiet = a.sahiDaam.weeks[9]!.returnPct
    const complaining = a.sahiDaam.weeks[16]!.returnPct
    expect(complaining - quiet).toBeGreaterThan(0.04)
  })

  it('raises alerts during the journey, including the festive warning', () => {
    const all = a.sahiDaam.weeks.flatMap((w) => w.alerts)
    expect(all.length).toBeGreaterThan(0)
    expect(all.some((alert) => alert.id === 'T2')).toBe(true)
    for (const alert of all) {
      expect(alert.week).toBeGreaterThanOrEqual(1)
      expect(alert.detail.length).toBeGreaterThan(0)
    }
  })

  it('keeps stock and profit arithmetic consistent week to week', () => {
    for (const run of [a.sahiDaam, a.sellerInstinct, a.meeshoRange]) {
      let cumulative = 0
      for (const week of run.weeks) {
        cumulative += week.profit
        expect(week.cumulativeProfit).toBeCloseTo(cumulative, 6)
        expect(week.stockLeft).toBeGreaterThanOrEqual(0)
        expect(week.cleanSales).toBeLessThanOrEqual(week.orders + 1e-9)
        expect(week.orders).toBeGreaterThanOrEqual(0)
      }
      expect(run.summary.totalProfit).toBeCloseTo(cumulative, 6)
    }
  })

  it('lets the learner find a peak and recover something near the true ε', () => {
    const learner = a.sahiDaam.learner!
    expect(learner.status).toBe('PEAKED')
    expect(learner.bestPrice).toBeGreaterThan(0)
    expect(a.sahiDaam.learnerSteps.length).toBeGreaterThan(2)
    expect(a.sahiDaam.learnerSteps.at(-1)!.kept).toBe(false) // the revert
    // ε̂ is noisy per step, but the running average should land near 2.2.
    expect(learner.elasticityAverage).toBeGreaterThan(1.2)
    expect(learner.elasticityAverage).toBeLessThan(3.2)
    expect(a.hidden.epsilon).toBe(2.2)
  })
})

// ---------------------------------------------------------------------------
// Spec section 10, test 9 — Learner isolation
// ---------------------------------------------------------------------------

describe('test 9 — learner.ts never reads the world it is learning about', () => {
  const source = readFileSync(resolve(__dirname, '../src/engine/learner.ts'), 'utf8')

  it('does not import anything from simulator.ts', () => {
    expect(source).not.toMatch(/from\s+['"]\.\/simulator['"]/)
    expect(source).not.toMatch(/from\s+['"].*simulator.*['"]/)
    expect(source).not.toMatch(/require\(['"].*simulator.*['"]\)/)
    expect(source).not.toMatch(/import\(['"].*simulator.*['"]\)/)
  })

  it('imports nothing at all — every input arrives as an argument', () => {
    const imports = source.match(/^\s*import\s.+$/gm) ?? []
    expect(imports).toEqual([])
  })

  it('never names a hidden demand parameter', () => {
    // Spec section 6.5: "It must never read the simulator's hidden demand
    // parameters." ε is the one that would let it cheat outright.
    for (const forbidden of [
      'epsilon',
      'hiddenDemand',
      'journey.json',
      'baseCvr',
      'visibility',
      'baseImpressions',
      'ratingBoost',
    ]) {
      expect(source).not.toContain(forbidden)
    }
  })

  it('reaches its estimate of ε from observed data alone', () => {
    // Two weeks of observations, built here with a known elasticity of 2.2 —
    // the learner recovers it without being told.
    const bandP50 = 318
    const base: Omit<WeekObservation, 'price' | 'orders' | 'week'> = {
      impressions: 10_000,
      survivalRate: 0.7,
      floor: 318,
      categoryTrend: 1,
    }
    const trueEpsilon = 2.2
    const cvrAt = (price: number) => 0.02 * Math.pow(price / bandP50, -trueEpsilon)
    const w1: WeekObservation = { ...base, week: 1, price: 340, orders: 10_000 * cvrAt(340) }
    const w2: WeekObservation = { ...base, week: 2, price: 360, orders: 10_000 * cvrAt(360) }

    expect(estimateElasticity(w1, w2)).toBeCloseTo(trueEpsilon, 9)
  })
})

// ---------------------------------------------------------------------------
// Spec section 6.5 — the learner's own rules
// ---------------------------------------------------------------------------

describe('learner rules (spec section 6.5)', () => {
  const bandP50 = 318
  const obs = (week: number, price: number, orders: number): WeekObservation => ({
    week,
    price,
    orders,
    impressions: 10_000,
    survivalRate: 0.7,
    floor: 300,
    categoryTrend: 1,
  })

  it('steps ₹20 below the band median and ₹10 at or above it', () => {
    expect(stepSizeFor(300, bandP50)).toBe(20)
    expect(stepSizeFor(317, bandP50)).toBe(20)
    expect(stepSizeFor(318, bandP50)).toBe(10)
    expect(stepSizeFor(400, bandP50)).toBe(10)
  })

  it('measures profit per 1,000 impressions', () => {
    // 200/10,000 conversion x 0.7 survival x ₹50 margin x 1,000.
    expect(profitPer1000Impressions(obs(1, 350, 200))).toBeCloseTo(0.02 * 0.7 * 50 * 1000, 6)
    expect(profitPer1000Impressions({ ...obs(1, 350, 200), impressions: 0 })).toBe(0)
  })

  it('keeps a step that improves the metric by more than 2%', () => {
    let state = createLearner(320)
    state = observeWeek(state, obs(1, 320, 200), bandP50)
    expect(state.status).toBe('STEPPING')
    expect(state.currentPrice).toBe(330) // 320 is above p50 → ₹10 step

    // A clearly better week at the new price.
    state = observeWeek(state, obs(2, 330, 240), bandP50)
    expect(state.steps).toHaveLength(1)
    expect(state.steps[0]!.kept).toBe(true)
    expect(state.status).toBe('STEPPING')
    expect(state.currentPrice).toBe(340)
  })

  it('reverts to the previous price and peaks when the metric falls', () => {
    let state = createLearner(320)
    state = observeWeek(state, obs(1, 320, 200), bandP50)
    state = observeWeek(state, obs(2, 330, 120), bandP50) // much worse

    expect(state.status).toBe('PEAKED')
    expect(state.bestPrice).toBe(320)
    expect(state.currentPrice).toBe(320)
    expect(state.steps.at(-1)!.kept).toBe(false)
    expect(state.steps.at(-1)!.reason).toContain('profit peak')
  })

  /** The order count at week 2 that produces a given improvement. */
  function ordersForImprovement(improvement: number): number {
    const before = profitPer1000Impressions(obs(1, 320, 200))
    const target = before * (1 + improvement)
    return (target / 1000 / 0.7 / (330 - 300)) * 10_000
  }

  it('needs more than a 2% improvement, not merely 2%', () => {
    // Exactly 2% is not tested: `improvement > 0.02` on floating-point
    // arithmetic is a knife edge, and a test that depends on which side of it
    // the last bit lands is testing the IEEE spec, not this rule.
    let justUnder = createLearner(320)
    justUnder = observeWeek(justUnder, obs(1, 320, 200), bandP50)
    justUnder = observeWeek(
      justUnder,
      obs(2, 330, ordersForImprovement(IMPROVEMENT_THRESHOLD - 0.001)),
      bandP50,
    )
    expect(justUnder.steps.at(-1)!.kept).toBe(false)
    expect(justUnder.status).toBe('PEAKED')

    let justOver = createLearner(320)
    justOver = observeWeek(justOver, obs(1, 320, 200), bandP50)
    justOver = observeWeek(
      justOver,
      obs(2, 330, ordersForImprovement(IMPROVEMENT_THRESHOLD + 0.001)),
      bandP50,
    )
    expect(justOver.steps.at(-1)!.kept).toBe(true)
    expect(justOver.status).toBe('STEPPING')
  })

  it('divides out the category trend, so a festive lift is not mistaken for a win', () => {
    let state = createLearner(320)
    state = observeWeek(state, obs(1, 320, 200), bandP50)
    // Orders hold flat at 200 while the whole category runs 50% hot. The raw
    // metric still rises, because the ₹10 step widened the margin — but once
    // the trend is divided out there is no real improvement at all.
    state = observeWeek(state, { ...obs(2, 330, 200), categoryTrend: 1.5 }, bandP50)

    const step = state.steps.at(-1)!
    expect(step.metricAfter).toBeGreaterThan(step.metricBefore) // raw: looks good
    expect(step.normalisedAfter).toBeCloseTo(step.normalisedBefore, 6) // real: flat
    expect(step.kept).toBe(false)
    expect(state.status).toBe('PEAKED')
  })

  it('stops proposing steps once it has peaked', () => {
    let state = createLearner(320)
    state = observeWeek(state, obs(1, 320, 200), bandP50)
    state = observeWeek(state, obs(2, 330, 100), bandP50)
    expect(state.status).toBe('PEAKED')
    const after = observeWeek(state, obs(3, 320, 500), bandP50)
    expect(after.status).toBe('PEAKED')
    expect(after.currentPrice).toBe(320)
    expect(after.steps).toHaveLength(state.steps.length)
  })

  it('returns null for an elasticity it cannot compute', () => {
    const a = obs(1, 320, 200)
    expect(estimateElasticity(a, obs(2, 320, 180))).toBeNull() // same price
    expect(estimateElasticity(a, obs(2, 330, 0))).toBeNull() // no conversions
  })
})
