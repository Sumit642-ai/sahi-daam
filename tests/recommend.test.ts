import { describe, expect, it } from 'vitest'

import { categories } from '../src/data'
import { bandFor, percentileOf, quantile } from '../src/engine/band'
import { defaultFloorInput, floorRange, type FloorInput } from '../src/engine/floor'
import {
  ABOVE_MARKET_PERCENTILE,
  CHEAP_END_WARNING,
  GUARDRAIL_WARNING,
  STAGES,
  minMarginFor,
  recommend,
  verdictFor,
  type Stage,
} from '../src/engine/recommend'

const CATEGORY_IDS = categories.map((c) => c.id)

// ---------------------------------------------------------------------------
// Spec section 10, test 5 — Guardrail
// ---------------------------------------------------------------------------

describe('test 5 — guardrail: no stage ever recommends below the floor', () => {
  /** A small deterministic PRNG, so a failure can actually be reproduced. */
  function mulberry32(seed: number) {
    let a = seed >>> 0
    return () => {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  it('holds across all categories, all stages and 1,000 random inputs', { timeout: 30_000 }, () => {
    const rnd = mulberry32(0x5a4100da)
    const bands = new Map(CATEGORY_IDS.map((id) => [id, bandFor(id)]))
    let checked = 0

    for (let i = 0; i < 1_000; i += 1) {
      const categoryId = CATEGORY_IDS[Math.floor(rnd() * CATEGORY_IDS.length)]!
      const band = bands.get(categoryId)!

      const input: FloorInput = {
        ...defaultFloorInput(categoryId),
        cogs: Math.round(20 + rnd() * 900),
        weightG: Math.round(50 + rnd() * 3_000),
        codShare: rnd(),
        rtoCod: rnd() * 0.6,
        rtoPrepaid: rnd() * 0.2,
        writeOffShare: rnd(),
        packagingCost: Math.round(rnd() * 40),
        adSpendPerOrder: Math.round(rnd() * 25),
        seasonIndex: 1 + rnd() * 0.9,
      }
      const range = floorRange(input)

      // Contexts are randomised too: a stale learned price or an aggressive
      // markdown ladder is exactly how a guardrail gets broken.
      const context = {
        currentPrice: Math.round(10 + rnd() * 900),
        launchPrice: Math.round(10 + rnd() * 900),
        learnedBestPrice: Math.round(10 + rnd() * 900),
        competitorUndercut: rnd() < 0.5,
        competitorMedian: Math.round(10 + rnd() * 900),
        stockCoverWeeks: Math.round(rnd() * 20),
        weeksInStage: Math.round(rnd() * 40),
      }

      for (const stage of STAGES) {
        const rec = recommend(stage, range, band, context)
        checked += 1
        if (rec.price < range.expected) {
          throw new Error(
            `Guardrail broken: ${categoryId}/${stage} recommended ₹${rec.price} ` +
              `below floor ₹${range.expected.toFixed(2)} — input ${JSON.stringify(input)}`,
          )
        }
        expect(rec.price).toBeGreaterThanOrEqual(range.expected)
        expect(Number.isFinite(rec.price)).toBe(true)
      }
    }

    expect(checked).toBe(4_000)
  })

  it('warns, rather than silently clamping, when the band target is below the floor', () => {
    // A kurti whose floor sits above the band's cheap end: launching at p30
    // would lose money, so the guardrail has to lift the price AND say why.
    // (The default ₹150 kurti's seller floor, ₹271, is under p30 = ₹282, so a
    // dearer one is needed to put the floor above the cheap end.)
    const input = defaultFloorInput('ethnic_women', { cogs: 170 })
    const range = floorRange(input)
    const band = bandFor('ethnic_women')
    expect(band.p30).toBeLessThan(range.expected) // the condition under test

    const rec = recommend('LAUNCH', range, band)
    expect(rec.warnings).toContain(CHEAP_END_WARNING)
    // Floor + margin sits under the median, so "above most of the market" would be false.
    expect(percentileOf(band, rec.price)).toBeLessThanOrEqual(ABOVE_MARKET_PERCENTILE)
    expect(rec.warnings).not.toContain(GUARDRAIL_WARNING)
    expect(rec.price).toBeGreaterThanOrEqual(range.expected)
    expect(rec.price).toBeCloseTo(Math.round(range.expected + minMarginFor(range.expected)), 0)
  })

  it('does not warn when the band comfortably clears the floor', () => {
    const input = defaultFloorInput('ethnic_women', { cogs: 60 })
    const range = floorRange(input)
    const band = bandFor('ethnic_women')
    expect(band.p30).toBeGreaterThan(range.expected)

    const rec = recommend('LAUNCH', range, band)
    expect(rec.warnings).not.toContain(GUARDRAIL_WARNING)
    expect(rec.price).toBe(Math.round(band.p30))
  })

  it('says "above most of the market" only past the 70th percentile', () => {
    // A floor high enough that floor + margin lands above p70.
    const range = floorRange(defaultFloorInput('ethnic_women', { cogs: 250 }))
    const band = bandFor('ethnic_women')
    const rec = recommend('LAUNCH', range, band)
    expect(percentileOf(band, rec.price)).toBeGreaterThan(ABOVE_MARKET_PERCENTILE)
    expect(rec.warnings).toContain(GUARDRAIL_WARNING)
  })

  it('uses minMargin = max(₹5, 2% of floor)', () => {
    expect(minMarginFor(318.12)).toBeCloseTo(6.3624, 4)
    expect(minMarginFor(100)).toBe(5) // 2% would be ₹2, so the ₹5 floor applies
    expect(minMarginFor(1_000)).toBe(20)
  })

  it('stops the decline ladder at the floor, never below it', () => {
    const input = defaultFloorInput('ethnic_women')
    const range = floorRange(input)
    const band = bandFor('ethnic_women')

    // 40 weeks of 5%-per-fortnight markdowns would land far below the floor.
    const rec = recommend('DECLINE', range, band, {
      currentPrice: 400,
      weeksInStage: 40,
      stockCoverWeeks: 12,
    })
    expect(rec.price).toBeGreaterThanOrEqual(range.expected)
    expect(rec.rationale.join(' ')).toContain('below your floor')
  })

  it('puts the real numbers in every rationale line', () => {
    const range = floorRange(defaultFloorInput('ethnic_women'))
    const band = bandFor('ethnic_women')
    for (const stage of STAGES) {
      const rec = recommend(stage as Stage, range, band, {
        currentPrice: 330,
        learnedBestPrice: 345,
        competitorUndercut: true,
        competitorMedian: 300,
        stockCoverWeeks: 8,
        weeksInStage: 4,
      })
      expect(rec.rationale.length).toBeGreaterThan(0)
      for (const line of rec.rationale) {
        expect(line).toMatch(/₹[\d,]/)
      }
    }
  })

  it('matches the worked rationale format from spec section 6.4', () => {
    const range = floorRange(defaultFloorInput('ethnic_women', { cogs: 170 }))
    const band = bandFor('ethnic_women')
    const rec = recommend('LAUNCH', range, band)
    // "Band 30th percentile is ₹282; your floor is ₹292; so we recommend ₹298 (floor + ₹6)."
    expect(rec.rationale[0]).toMatch(
      /^Band 30th percentile is ₹[\d,]+; your floor is ₹[\d,]+; so we recommend ₹[\d,]+ \(floor \+ ₹\d+\)\.$/,
    )
  })
})

// ---------------------------------------------------------------------------
// Spec section 10, test 6 — NOT_VIABLE
// ---------------------------------------------------------------------------

describe('test 6 — NOT_VIABLE and its fixes', () => {
  // ₹152 is the cheapest beauty product cost whose seller floor is above p90.
  const input = defaultFloorInput('beauty', { cogs: 152 })
  const range = floorRange(input)
  const band = bandFor('beauty')
  const result = verdictFor({ price: Math.round(band.p50), input, range, band })

  it('calls a ₹152 beauty product NOT_VIABLE', () => {
    expect(range.expected).toBeGreaterThan(band.p90)
    expect(result.verdict).toBe('NOT_VIABLE')
  })

  it('explains it with the two numbers that decide it', () => {
    expect(result.detail).toContain('₹241') // the floor
    expect(result.detail).toContain('₹240') // band p90
  })

  it('returns all four fixes, each with a recomputed floor', () => {
    expect(result.fixes.map((f) => f.id)).toEqual(['prepaid', 'lighter', 'bundle', 'cogs'])
    for (const fix of result.fixes) {
      expect(Number.isFinite(fix.newFloor)).toBe(true)
      expect(fix.newFloor).toBeLessThan(range.expected) // every fix must help
      expect(fix.delta).toBeLessThan(0)
      expect(fix.detail).toMatch(/\d/)
      expect(fix.label.length).toBeGreaterThan(0)
    }
    // Every fix states its rupee effect somewhere the seller can see it.
    for (const fix of result.fixes) {
      expect(`${fix.detail} ${fix.newFloor}`).toMatch(/₹|\d/)
    }
  })

  it('gives the bundle of 2 a lower per-unit floor', () => {
    const bundle = result.fixes.find((f) => f.id === 'bundle')!
    expect(bundle.newFloor).toBeLessThan(range.expected)
    // Per-order costs shared across two units is the single biggest lever here.
    expect(bundle.newFloor).toBeLessThan(range.expected * 0.85)
    expect(bundle.caveat).toMatch(/weight slab/)
  })

  it('offers lighter packaging when the product is already in the cheapest slab', () => {
    // Beauty's 200 g is in the 0–500 g slab, so there is no lower slab to drop to.
    const lighter = result.fixes.find((f) => f.id === 'lighter')!
    expect(lighter.label).toBe('Lighter packaging')
    expect(lighter.detail).toContain('cheapest shipping slab')
  })

  it('offers the next weight slab down when there is one', () => {
    // Footwear's 800 g sits in 501–1000 g, so the fix is to get under 500 g.
    const heavy = defaultFloorInput('footwear', { cogs: 900 })
    const heavyRange = floorRange(heavy)
    const heavyBand = bandFor('footwear')
    const heavyVerdict = verdictFor({
      price: Math.round(heavyBand.p50),
      input: heavy,
      range: heavyRange,
      band: heavyBand,
    })
    expect(heavyVerdict.verdict).toBe('NOT_VIABLE')
    const lighter = heavyVerdict.fixes.find((f) => f.id === 'lighter')!
    expect(lighter.label).toBe('Get under 500 g')
    expect(lighter.newFloor).toBeLessThan(heavyRange.expected)
  })

  it('leaves fixes empty for every verdict except NOT_VIABLE', () => {
    const healthy = defaultFloorInput('ethnic_women', { cogs: 60 })
    const healthyRange = floorRange(healthy)
    const healthyBand = bandFor('ethnic_women')
    for (const price of [100, 250, 400]) {
      const v = verdictFor({ price, input: healthy, range: healthyRange, band: healthyBand })
      expect(v.verdict).not.toBe('NOT_VIABLE')
      expect(v.fixes).toEqual([])
    }
  })
})

// ---------------------------------------------------------------------------
// Spec section 6.2 — the verdict ladder
// ---------------------------------------------------------------------------

describe('verdict thresholds (spec section 6.2)', () => {
  const input = defaultFloorInput('ethnic_women', { cogs: 60 })
  const range = floorRange(input)
  const band = bandFor('ethnic_women')
  const floor = range.expected
  const at = (price: number) => verdictFor({ price, input, range, band }).verdict

  it('is LOSS below the floor', () => {
    expect(at(floor - 1)).toBe('LOSS')
    expect(at(floor - 100)).toBe('LOSS')
  })

  it('is THIN from the floor up to a 10% margin', () => {
    expect(at(floor)).toBe('THIN') // margin exactly 0
    expect(at(floor / 0.95)).toBe('THIN') // 5% margin
  })

  it('is HEALTHY at a 10% margin and above', () => {
    expect(at(floor / 0.9 + 0.01)).toBe('HEALTHY')
    expect(at(floor * 2)).toBe('HEALTHY')
  })

  it('switches exactly at the 10% boundary', () => {
    const tenPct = floor / 0.9 // the price at which margin == 0.10
    expect(at(tenPct - 0.01)).toBe('THIN')
    expect(at(tenPct + 0.01)).toBe('HEALTHY')
  })

  it('reports NOT_VIABLE regardless of price, because price cannot fix it', () => {
    const bad = defaultFloorInput('beauty', { cogs: 152 })
    const badRange = floorRange(bad)
    const badBand = bandFor('beauty')
    for (const price of [50, 240, 1_000]) {
      expect(verdictFor({ price, input: bad, range: badRange, band: badBand }).verdict).toBe(
        'NOT_VIABLE',
      )
    }
  })
})

// ---------------------------------------------------------------------------
// Spec section 6.3 — band statistics
// ---------------------------------------------------------------------------

describe('band statistics (spec section 6.3)', () => {
  it('produces 40 synthetic listings per category, in ascending price order', () => {
    for (const id of CATEGORY_IDS) {
      const band = bandFor(id)
      expect(band.count).toBe(40)
      expect(band.synthetic).toBe(true)
      expect(band.listings).toHaveLength(40)
      const prices = band.listings.map((l) => l.price)
      expect(prices).toEqual([...prices].sort((a, b) => a - b))
    }
  })

  it('orders the percentiles and bounds them by min and max', () => {
    for (const id of CATEGORY_IDS) {
      const b = bandFor(id)
      expect(b.min).toBeLessThanOrEqual(b.p10)
      expect(b.p10).toBeLessThanOrEqual(b.p25)
      expect(b.p25).toBeLessThanOrEqual(b.p30)
      expect(b.p30).toBeLessThanOrEqual(b.p50)
      expect(b.p50).toBeLessThanOrEqual(b.p75)
      expect(b.p75).toBeLessThanOrEqual(b.p90)
      expect(b.p90).toBeLessThanOrEqual(b.max)
    }
  })

  it('lands each band on the median and spread its category configures', () => {
    for (const category of categories) {
      const b = bandFor(category.id)
      // Within 5% of the configured median...
      expect(Math.abs(b.p50 - category.bandMedian) / category.bandMedian).toBeLessThan(0.05)
      // ...and p90 near median x (1 + spread), which is what ±35% means.
      const expectedP90 = category.bandMedian * (1 + category.bandSpread)
      expect(Math.abs(b.p90 - expectedP90) / expectedP90).toBeLessThan(0.1)
    }
  })

  it('inverts quantile exactly when prices are strictly increasing', () => {
    const strict = { prices: Array.from({ length: 40 }, (_, i) => 100 + i * 7) }
    for (const q of [0, 10, 25, 30, 50, 75, 90, 100]) {
      expect(percentileOf(strict, quantile(strict.prices, q / 100))).toBeCloseTo(q, 6)
    }
  })

  it('round-trips the real bands to within a rank, where whole-rupee ties exist', () => {
    // Listing prices are whole rupees, so quantile has flats and cannot be
    // inverted exactly. One rank out of 40 is 2.6 percentile points.
    for (const id of CATEGORY_IDS) {
      const b = bandFor(id)
      for (const [q, value] of [
        [10, b.p10],
        [30, b.p30],
        [50, b.p50],
        [90, b.p90],
      ] as const) {
        expect(Math.abs(percentileOf(b, value) - q)).toBeLessThanOrEqual(100 / (b.count - 1))
      }
    }
  })

  it('clamps percentileOf outside the band', () => {
    const b = bandFor('ethnic_women')
    expect(percentileOf(b, 0)).toBe(0)
    expect(percentileOf(b, b.min - 1)).toBe(0)
    expect(percentileOf(b, b.max + 1)).toBe(100)
    expect(percentileOf(b, 10_000)).toBe(100)
  })

  it('increases monotonically with price', () => {
    const b = bandFor('ethnic_women')
    let last = -1
    for (let price = b.min; price <= b.max; price += 5) {
      const p = percentileOf(b, price)
      expect(p).toBeGreaterThanOrEqual(last)
      last = p
    }
  })

  it('interpolates quantiles between the two closest ranks', () => {
    expect(quantile([10, 20, 30, 40], 0)).toBe(10)
    expect(quantile([10, 20, 30, 40], 1)).toBe(40)
    expect(quantile([10, 20, 30, 40], 0.5)).toBe(25)
    expect(quantile([10, 20], 0.5)).toBe(15)
    expect(quantile([7], 0.9)).toBe(7)
  })
})
