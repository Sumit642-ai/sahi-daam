import { describe, expect, it } from 'vitest'

import { bandFor } from '../src/engine/band'
import { defaultFloorInput, floorRange } from '../src/engine/floor'
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

describe('demo beat 1 — the kurti at ₹300', () => {
  const range = floorRange(KURTI)

  it('shows a floor of ₹315–₹362, most likely ₹318', () => {
    expect(Math.round(range.low)).toBe(315)
    expect(Math.round(range.expected)).toBe(318)
    expect(Math.round(range.high)).toBe(362)
  })

  it('turns "I earn ₹150" into "I lose ₹18"', () => {
    expect(300 - KURTI.cogs).toBe(150)
    expect(Math.round(300 - range.expected)).toBe(-18)
  })

  it('reproduces the deck cost table', () => {
    const r = range.results.expected
    expect(Math.round(r.totalOverhead)).toBe(11_763) // deck ₹11,760
    expect(Math.round(r.cleanSales)).toBe(70) // deck 70
    expect(Math.round(r.overheadPerCleanSale)).toBe(168) // deck ₹168
    expect(r.costLines).toHaveLength(7)
  })
})

describe('demo beat 2 — slide the month to November', () => {
  it('moves the floor to about ₹374', () => {
    const november = floorRange({ ...KURTI, seasonIndex: seasonIndex('Nov') })
    expect(Math.round(november.low)).toBe(374)
    expect(Math.round(november.expected)).toBe(378)
    // RTO really does jump to 31.7%.
    expect(november.results.expected.rto).toBeCloseTo(0.317, 3)
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

describe('demo beat 4 — beauty at ₹120 is not viable', () => {
  const input = defaultFloorInput('beauty', { cogs: 120 })
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
    expect(Math.round(range.expected)).toBe(252)
    expect(Math.round(cheapest.newFloor)).toBe(188)
    expect(cheapest.viableNow).toBe(true)
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
    expect(at(low).verdict).toBe('LOSS')
    expect(Math.round(low - range.expected)).toBe(-39)
    expect(at(mid).verdict).toBe('THIN')
    expect(at(high).verdict).toBe('HEALTHY')
  })
})

describe('demo beat 6 — play the 26-week journey', () => {
  const sim = runSimulation()

  it('ends with Sahi Daam ahead by about ₹79,500', () => {
    const gap = sim.sahiDaam.summary.totalProfit - sim.sellerInstinct.summary.totalProfit
    expect(Math.round(sim.sahiDaam.summary.totalProfit)).toBe(46_058)
    expect(Math.round(sim.sellerInstinct.summary.totalProfit)).toBe(-33_508)
    expect(Math.round(gap)).toBe(79_566)
  })

  it('shows the seller who lost money selling more units', () => {
    expect(sim.sellerInstinct.summary.unitsSold).toBeGreaterThan(sim.sahiDaam.summary.unitsSold)
    expect(sim.sahiDaam.summary.weeksBelowFloor).toBe(0)
    expect(sim.sellerInstinct.summary.weeksBelowFloor).toBe(26)
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

  it('lets the learner reach ε̂ 2.18 without ever seeing the true 2.2', () => {
    expect(sim.sahiDaam.learner!.elasticityAverage).toBeCloseTo(2.18, 1)
    expect(sim.hidden.epsilon).toBe(2.2)
  })
})
