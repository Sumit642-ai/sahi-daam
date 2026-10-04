import { describe, expect, it } from 'vitest'

import { bandFor } from '../src/engine/band'
import { costToServeRange, defaultFloorInput, floorRange } from '../src/engine/floor'
import { recommendAllStages, verdictFor } from '../src/engine/recommend'
import { seasonIndex } from '../src/engine/season'
import { runSimulation } from '../src/engine/simulator'

/**
 * The 90-second demo path (spec section 13), beat by beat.
 *
 * Every number the presenter says out loud is pinned here, so a change to the
 * engine that quietly moves one of them fails the build instead of surfacing
 * on stage.
 */

const KURTI = defaultFloorInput('ethnic_women', { cogs: 150, weightG: 350 })
const ETHNIC_BAND = bandFor('ethnic_women')
/** The cheapest beauty product cost that is NOT_VIABLE on the seller floor. */
const BEAUTY_DEMO_COGS = 152

describe('demo beat 1 — the kurti at ₹300', () => {
  const range = floorRange(KURTI)
  const cts = costToServeRange(KURTI)

  it('shows a seller floor of ₹268–₹312, most likely ₹271', () => {
    expect(Math.round(range.low)).toBe(268)
    expect(Math.round(range.expected)).toBe(271)
    expect(Math.round(range.high)).toBe(312)
  })

  it('shows the full cost-to-serve beside it as ₹318', () => {
    expect(Math.round(cts.expected)).toBe(318)
    expect(Math.round(range.results.expected.absorbedPerCleanSale)).toBe(51)
  })

  it('turns "I earn ₹150" into "I keep ₹29"', () => {
    expect(300 - KURTI.cogs).toBe(150)
    expect(Math.round(300 - range.expected)).toBe(29)
  })

  it('builds the seller table from six lines the seller pays', () => {
    const r = range.results.expected
    expect(Math.round(r.totalOverhead)).toBe(8_441)
    expect(Math.round(r.cleanSales)).toBe(70)
    expect(Math.round(r.overheadPerCleanSale)).toBe(121)
    expect(r.costLines).toHaveLength(6)
    expect(r.costLines.every((l) => l.payer === 'seller')).toBe(true)
    expect(r.absorbedLines.every((l) => l.payer === 'meesho')).toBe(true)
  })
})

describe('demo beat 2 — slide the month to November', () => {
  it('lifts RTO to 31.7% but barely moves the seller floor', () => {
    const november = floorRange({ ...KURTI, seasonIndex: seasonIndex('Nov') })
    expect(november.results.expected.rto).toBeCloseTo(0.317, 3)
    expect(Math.round(november.expected)).toBe(273)
    // Under the supplier policy an RTO costs the seller only its packaging.
    expect(november.expected - floorRange(KURTI).expected).toBeLessThan(5)
    // At full cost-to-serve the same month is a big jump.
    expect(Math.round(costToServeRange({ ...KURTI, seasonIndex: seasonIndex('Nov') }).expected)).toBe(378)
  })
})

describe('demo beat 3 — drag the price across the floor on Screen 2', () => {
  const range = floorRange(KURTI)

  it('flips the verdict as the price crosses the floor', () => {
    const at = (price: number) =>
      verdictFor({ price, input: KURTI, range, band: ETHNIC_BAND }).verdict
    expect(at(250)).toBe('LOSS')
    expect(at(Math.ceil(range.expected))).toBe('THIN')
    expect(at(400)).toBe('HEALTHY')
  })

  it('gives all four stage cards a price above the floor', () => {
    const recommendations = recommendAllStages(range, ETHNIC_BAND, { currentPrice: 330 })
    for (const stage of ['LAUNCH', 'RAMP', 'MATURE', 'DECLINE'] as const) {
      expect(recommendations[stage].price).toBeGreaterThanOrEqual(range.expected)
      expect(recommendations[stage].rationale.length).toBeGreaterThan(0)
    }
    // The launch card is the one the demo reads out.
    expect(recommendations.LAUNCH.rationale[0]).toMatch(/Band 30th percentile is ₹/)
  })
})

describe('demo beat 4 — beauty at ₹152 is not viable', () => {
  const input = defaultFloorInput('beauty', { cogs: BEAUTY_DEMO_COGS })
  const range = floorRange(input)
  const band = bandFor('beauty')
  const verdict = verdictFor({ price: Math.round(band.p50), input, range, band })

  it('reports NOT_VIABLE with four costed fixes', () => {
    expect(verdict.verdict).toBe('NOT_VIABLE')
    expect(verdict.fixes).toHaveLength(4)
    for (const fix of verdict.fixes) expect(fix.newFloor).toBeLessThan(range.expected)
  })

  it('makes the bundle of 2 the biggest lever', () => {
    const cheapest = [...verdict.fixes].sort((a, b) => a.newFloor - b.newFloor)[0]!
    expect(cheapest.id).toBe('bundle')
    expect(Math.round(range.expected)).toBe(241)
    expect(Math.round(cheapest.newFloor)).toBe(200)
    expect(cheapest.viableNow).toBe(true)
  })

  it('is the cheapest beauty product that is not viable', () => {
    const band = bandFor('beauty')
    const below = floorRange(defaultFloorInput('beauty', { cogs: BEAUTY_DEMO_COGS - 1 }))
    expect(below.expected).toBeLessThanOrEqual(band.p90)
    expect(range.expected).toBeGreaterThan(band.p90)
  })
})

describe('demo beat 5 — Meesho today vs Sahi Daam', () => {
  const range = floorRange(KURTI)

  it('prices all three points of Meesho’s recommended range', () => {
    const low = Math.round(ETHNIC_BAND.p25)
    const high = Math.round(ETHNIC_BAND.p75)
    const mid = Math.round((ETHNIC_BAND.p25 + ETHNIC_BAND.p75) / 2)
    expect(low).toBe(279)
    expect(high).toBe(371)

    const at = (price: number) => verdictFor({ price, input: KURTI, range, band: ETHNIC_BAND })
    expect(at(low).verdict).toBe('THIN')
    expect(Math.round(low - range.expected)).toBe(8)
    expect(at(mid).verdict).toBe('HEALTHY')
    expect(at(high).verdict).toBe('HEALTHY')
  })
})

describe('demo beat 6 — play the 26-week journey', () => {
  const sim = runSimulation()

  it('ends with Sahi Daam ahead of both baselines', () => {
    const sahi = Math.round(sim.sahiDaam.summary.totalProfit)
    const instinct = Math.round(sim.sellerInstinct.summary.totalProfit)
    const range = Math.round(sim.meeshoRange.summary.totalProfit)
    expect(sahi).toBe(121_541)
    expect(instinct).toBe(54_642)
    expect(range).toBe(81_233)
    expect(Math.round(sim.sahiDaam.summary.totalProfit - sim.sellerInstinct.summary.totalProfit)).toBe(66_898)
    expect(Math.round(sim.sahiDaam.summary.totalProfit - sim.meeshoRange.summary.totalProfit)).toBe(40_307)
  })

  it('earns more per unit on almost the same volume', () => {
    // All three sell through their stock; what differs is what each unit earns.
    const perUnit = (r: typeof sim.sahiDaam) => r.summary.totalProfit / r.summary.unitsSold
    expect(perUnit(sim.sahiDaam)).toBeGreaterThan(perUnit(sim.meeshoRange))
    expect(perUnit(sim.meeshoRange)).toBeGreaterThan(perUnit(sim.sellerInstinct))
    expect(sim.sahiDaam.summary.weeksBelowFloor).toBe(0)
  })

  it('raises alerts in weeks 12, 14, 16 and 17 — the beats the demo stops on', () => {
    const weeks = sim.sahiDaam.weeks.filter((w) => w.alerts.length > 0).map((w) => w.week)
    expect(weeks).toEqual([12, 14, 16, 17])
    // Week 16 is the festive warning the demo opens on the phone.
    const week16 = sim.sahiDaam.weeks[15]!.alerts
    expect(week16.some((a) => a.id === 'T2')).toBe(true)
  })

  it('plays end to end in under a minute', () => {
    // Screen 3 advances one week every 1.3 s (spec acceptance item 5).
    expect(sim.sahiDaam.weeks.length * 1.3).toBeLessThan(60)
  })

  it('lets the learner reach about 2.06 without ever seeing the true 2.2', () => {
    expect(sim.sahiDaam.learner!.elasticityAverage).toBeCloseTo(2.06, 2)
    expect(sim.hidden.epsilon).toBe(2.2)
  })
})
