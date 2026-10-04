import { describe, expect, it } from 'vitest'

import {
  defaultFloorInput,
  costToServe as floor,
  costToServeRange as floorRange,
  keepPerCleanSale,
  meeshoAbsorbs,
  sellerFloor,
  fwd,
  marginPct,
  profitPer100Dispatched,
  profitPerCleanSale,
  rev,
  slabFor,
} from '../src/engine/floor'
import { seasonIndex } from '../src/engine/season'

/** The deck's kurti: ethnic_women, ₹150 COGS, 350 g, everything else default. */
const kurti = () => defaultFloorInput('ethnic_women', { cogs: 150, weightG: 350 })

// ---------------------------------------------------------------------------
// Spec section 10, test 1 — Deck worked example, exact
// ---------------------------------------------------------------------------

describe('test 1 — deck worked example, exact', () => {
  const result = floor({
    ...kurti(),
    unitOverrides: { rtoUnits: 17, returnUnits: 13, writeOffUnits: 6, cleanSales: 70 },
  })

  it('totals ₹11,760 of overhead on 100 dispatched', () => {
    expect(result.totalOverhead).toBe(11_760)
  })

  it('spreads that over 70 clean sales as exactly ₹168', () => {
    expect(result.overheadPerCleanSale).toBe(168)
  })

  it('gives a floor of exactly ₹318', () => {
    expect(result.floor).toBe(318)
  })

  it('reproduces the seven cost lines from the deck table', () => {
    const byKey = Object.fromEntries(result.costLines.map((l) => [l.key, l.amount]))
    expect(byKey).toEqual({
      forward: 5_000, // 100 × ₹50
      reverse: 3_600, // (17 + 13) × ₹120
      gst: 900, //      18% × ₹5,000
      packaging: 800, // 100 × ₹8
      cod: 560, //      100 × 80% × ₹7
      writeOff: 900, //  6 × ₹150
      ad: 0, //         100 × ₹0
    })
    expect(result.costLines).toHaveLength(7)
  })

  it('shows the working for each line', () => {
    const working = Object.fromEntries(result.costLines.map((l) => [l.key, l.working]))
    expect(working.forward).toBe('100 × ₹50')
    expect(working.reverse).toBe('(17 + 13) × ₹120')
    expect(working.gst).toBe('18% × ₹5,000')
    expect(working.packaging).toBe('100 × ₹8')
    expect(working.cod).toBe('100 × 80% × ₹7')
    expect(working.writeOff).toBe('6 × ₹150')
  })

  it('survives 70 of every 100 dispatched', () => {
    expect(result.survivalRate).toBe(0.7)
    expect(result.deliveredUnits).toBe(83)
  })

  it('turns the seller’s ₹150 "profit" at ₹300 into an ₹18 loss', () => {
    // The hook in spec section 1: cost-plus thinking says ₹300 - ₹150 = ₹150.
    expect(300 - result.input.cogs).toBe(150)
    expect(profitPerCleanSale(300, result.floor)).toBe(-18)
    expect(profitPer100Dispatched(300, result)).toBe(-1_260) // 70 × -₹18
    expect(marginPct(300, result.floor)).toBeCloseTo(-0.06, 10)
  })
})

// ---------------------------------------------------------------------------
// Spec section 10, test 2 — Continuous model
// ---------------------------------------------------------------------------
//
// NOTE ON THE RETURN RATE (see DECISIONS.md, decision 1).
// The spec's targets of ₹315.2 and ₹362.5 are the floor at return rates 0.15
// and 0.25 — ethnic_women's returnRateLow and returnRateHigh — and acceptance
// item 1 ("floor ₹315–₹362") is that low-to-high range. The expected rate sits
// between them at 13/83 = 0.157, read off the deck's worked example, which is
// what makes the continuous model land on the deck's ₹318 with no rounding.

describe('test 2 — continuous model', () => {
  const range = floorRange(kurti())

  it('gives ₹315.2 at the low return rate of 0.15', () => {
    expect(range.returnRates.low).toBe(0.15)
    expect(range.low).toBeCloseTo(315.2, 1)
    expect(Math.abs(range.low - 315.2)).toBeLessThanOrEqual(0.5)
  })

  it('gives ₹362.5 at the high return rate of 0.25', () => {
    expect(range.returnRates.high).toBe(0.25)
    expect(Math.abs(range.high - 362.5)).toBeLessThanOrEqual(0.5)
  })

  it('agrees with a direct floor() call at each return rate', () => {
    expect(floor({ ...kurti(), returnRate: 0.15 }).floor).toBeCloseTo(range.low, 10)
    expect(floor({ ...kurti(), returnRate: 0.25 }).floor).toBeCloseTo(range.high, 10)
  })

  it('uses fractional units, unlike the deck’s rounded ones', () => {
    const r = floor({ ...kurti(), returnRate: 0.15 })
    expect(r.rto).toBeCloseTo(0.17, 10) // 0.8 × 0.20 + 0.2 × 0.05
    expect(r.rtoUnits).toBeCloseTo(17, 10)
    expect(r.deliveredUnits).toBeCloseTo(83, 10)
    expect(r.returnUnits).toBeCloseTo(12.45, 10) // 83 × 0.15
    expect(r.cleanSales).toBeCloseTo(70.55, 10)
    expect(r.writeOffUnits).toBeCloseTo(5.727, 3) // 12.45 × 0.46
  })

  it('reproduces the deck’s ₹318 at the expected return rate, with no rounding', () => {
    // ethnic_women's expected return rate is 13/83 = 0.157, read off the deck's
    // own worked example (see DECISIONS.md, decision 1). So the CONTINUOUS model
    // lands on the deck table without needing any unit overrides at all.
    expect(range.returnRates.expected).toBe(0.157)
    expect(range.expected).toBeCloseTo(318, 0)
    expect(Math.abs(range.expected - 318)).toBeLessThanOrEqual(0.5)
  })

  it('reproduces every deck cost line at the expected return rate', () => {
    const r = range.results.expected
    const byKey = Object.fromEntries(r.costLines.map((l) => [l.key, l.amount]))
    expect(byKey.forward).toBeCloseTo(5_000, 10)
    expect(byKey.reverse!).toBeCloseTo(3_600, -1) // deck ₹3,600
    expect(byKey.gst).toBeCloseTo(900, 10)
    expect(byKey.packaging).toBeCloseTo(800, 10)
    expect(byKey.cod).toBeCloseTo(560, 10)
    expect(byKey.writeOff!).toBeCloseTo(900, -1) // deck ₹900
    expect(byKey.ad).toBe(0)
    expect(r.totalOverhead).toBeCloseTo(11_760, -1) // deck ₹11,760
    expect(r.cleanSales).toBeCloseTo(70, 1) // deck 70
    expect(r.overheadPerCleanSale).toBeCloseTo(168, 0) // deck ₹168
  })

  it('brackets the deck’s ₹318 between the low and high floors', () => {
    expect(range.low).toBeLessThan(318)
    expect(range.high).toBeGreaterThan(318)
  })

  it('still earns −₹15 to −₹18 at a ₹300 list price', () => {
    // Acceptance checklist item 2.
    expect(300 - range.expected).toBeCloseTo(-18, 0)
    expect(300 - range.low).toBeCloseTo(-15, 0)
  })
})

// ---------------------------------------------------------------------------
// Spec section 10, test 3 — Seasonality
// ---------------------------------------------------------------------------
//
// The ₹374 and ₹328 targets are at return rate 0.15, so these pass it explicitly.

describe('test 3 — seasonality', () => {
  it('lifts RTO to 31.7% in November and the floor to ₹374', () => {
    const november = seasonIndex('Nov')
    expect(november).toBe(1.867)

    const result = floor({ ...kurti(), returnRate: 0.15, seasonIndex: november })
    expect(result.rto).toBeCloseTo(0.317, 3)
    expect(result.rto * 100).toBeCloseTo(31.7, 1)
    expect(Math.abs(result.floor - 374)).toBeLessThanOrEqual(1)
  })

  it('lifts the floor to ₹328 in January', () => {
    const january = seasonIndex('Jan')
    expect(january).toBe(1.219)

    const result = floor({ ...kurti(), returnRate: 0.15, seasonIndex: january })
    expect(Math.abs(result.floor - 328)).toBeLessThanOrEqual(1)
  })

  it('leaves the floor unchanged in the March baseline month', () => {
    expect(seasonIndex('Mar')).toBe(1)
    const march = floor({ ...kurti(), returnRate: 0.15, seasonIndex: seasonIndex('Mar') })
    const noSeason = floor({ ...kurti(), returnRate: 0.15 })
    expect(march.floor).toBeCloseTo(noSeason.floor, 10)
  })

  it('scales the seller’s own baseline rather than setting an absolute RTO', () => {
    // A seller with a prepaid-heavy mix feels the same season far less.
    const prepaidHeavy = { ...kurti(), returnRate: 0.15, codShare: 0.2 }
    const base = floor(prepaidHeavy)
    const festive = floor({ ...prepaidHeavy, seasonIndex: seasonIndex('Nov') })
    expect(festive.rto).toBeCloseTo(base.rto * 1.867, 10)
    expect(festive.rto).toBeLessThan(0.317) // well under the COD-heavy seller
  })
})

// ---------------------------------------------------------------------------
// Spec section 10, test 4 — Monotonicity
// ---------------------------------------------------------------------------

describe('test 4 — monotonicity', () => {
  const strictlyIncreasing = (values: number[]) => {
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]!).toBeGreaterThan(values[i - 1]!)
    }
  }

  it('increases strictly with RTO', () => {
    const floors = [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6].map(
      (rtoCod) => floor({ ...kurti(), rtoCod }).floor,
    )
    strictlyIncreasing(floors)
  })

  it('increases strictly with the season index, which is RTO by another route', () => {
    const floors = [1, 1.1, 1.219, 1.4, 1.6, 1.867].map(
      (seasonIdx) => floor({ ...kurti(), seasonIndex: seasonIdx }).floor,
    )
    strictlyIncreasing(floors)
  })

  it('increases strictly with the return rate', () => {
    const floors = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5].map(
      (returnRate) => floor({ ...kurti(), returnRate }).floor,
    )
    strictlyIncreasing(floors)
  })

  it('increases strictly with the weight slab', () => {
    // One representative weight per slab: within a slab shipping is flat, so
    // monotonicity is a statement about slabs, not about grams.
    const weights = [350, 800, 1_200, 1_800, 2_300, 2_800, 3_300]
    strictlyIncreasing(weights.map((weightG) => floor({ ...kurti(), weightG }).floor))

    // And flat inside a slab, which is what makes the step function correct.
    expect(floor({ ...kurti(), weightG: 1 }).floor).toBe(floor({ ...kurti(), weightG: 500 }).floor)
  })

  it('steps the shipping slabs exactly as spec section 5.2 lists them', () => {
    expect([fwd(350), rev(350)]).toEqual([50, 120])
    expect([fwd(500), rev(500)]).toEqual([50, 120])
    expect([fwd(501), rev(501)]).toEqual([70, 150])
    expect([fwd(1_000), rev(1_000)]).toEqual([70, 150])
    expect([fwd(1_001), rev(1_001)]).toEqual([90, 180])
    expect([fwd(1_500), rev(1_500)]).toEqual([90, 180])
    expect([fwd(1_501), rev(1_501)]).toEqual([110, 210])
    expect([fwd(2_000), rev(2_000)]).toEqual([110, 210])
    // each extra 500 g: +₹20 forward, +₹30 reverse
    expect([fwd(2_001), rev(2_001)]).toEqual([130, 240])
    expect([fwd(2_500), rev(2_500)]).toEqual([130, 240])
    expect([fwd(2_501), rev(2_501)]).toEqual([150, 270])
    expect([fwd(3_000), rev(3_000)]).toEqual([150, 270])
    expect(slabFor(2_600).label).toBe('2501–3000 g')
  })

  it('increases strictly with COGS, packaging and ad spend too', () => {
    strictlyIncreasing([100, 150, 200, 400].map((cogs) => floor({ ...kurti(), cogs }).floor))
    strictlyIncreasing(
      [0, 8, 15, 25].map((packagingCost) => floor({ ...kurti(), packagingCost }).floor),
    )
    strictlyIncreasing(
      [0, 2, 5, 10].map((adSpendPerOrder) => floor({ ...kurti(), adSpendPerOrder }).floor),
    )
  })
})

// ---------------------------------------------------------------------------
// Supporting guards (not numbered in spec section 10, but section 6.1 requires
// the behaviour, so it is pinned here rather than discovered in phase 3).
// ---------------------------------------------------------------------------

describe('floor — edge behaviour required by spec section 6.1', () => {
  it('caps RTO at 0.90 however high the season index goes', () => {
    const result = floor({ ...kurti(), rtoCod: 0.95, rtoPrepaid: 0.9, seasonIndex: 1.867 })
    expect(result.rto).toBe(0.9)
  })

  it('reports an infinite floor when no clean sale survives', () => {
    const result = floor({ ...kurti(), returnRate: 1, rtoCod: 0, rtoPrepaid: 0 })
    expect(result.cleanSales).toBe(0)
    expect(result.viable).toBe(false)
    expect(result.floor).toBe(Number.POSITIVE_INFINITY)
  })

  it('produces a finite, sensible floor above COGS for all eight categories', () => {
    for (const id of [
      'ethnic_women',
      'western_women',
      'men_apparel',
      'kids',
      'footwear',
      'home_kitchen',
      'beauty',
      'jewellery',
    ]) {
      const range = floorRange(defaultFloorInput(id))
      expect(Number.isFinite(range.expected)).toBe(true)
      expect(range.low).toBeGreaterThan(defaultFloorInput(id).cogs)
      expect(range.low).toBeLessThanOrEqual(range.expected)
      expect(range.expected).toBeLessThanOrEqual(range.high)
    }
  })

  it('rejects an unknown category id rather than silently defaulting', () => {
    expect(() => defaultFloorInput('not_a_category')).toThrow(/Unknown categoryId/)
  })
})

// ---------------------------------------------------------------------------
// The seller floor — what Meesho's supplier policy actually charges the seller
// ---------------------------------------------------------------------------

describe('sellerFloor — what the seller pays under the supplier policy', () => {
  /** Within ₹0.20: the targets are the deck's rounded units, the engine does not round. */
  const near = (actual: number, target: number) =>
    expect(Math.abs(actual - target)).toBeLessThanOrEqual(0.2)

  it('keeps the full cost-to-serve of the deck kurti at exactly ₹318', () => {
    const deck = floor({
      ...kurti(),
      seasonIndex: 1,
      unitOverrides: { rtoUnits: 17, returnUnits: 13, writeOffUnits: 6, cleanSales: 70 },
    })
    expect(deck.floor).toBe(318)
    expect(deck.model).toBe('costToServe')
  })

  it('gives the default kurti a seller floor of about ₹270.5', () => {
    near(sellerFloor(kurti()).floor, 270.5)
  })

  it('gives about ₹284.9 when the forward fee is also charged on RTOs', () => {
    near(sellerFloor({ ...kurti(), policy: { forwardOnRto: true } }).floor, 284.9)
  })

  it('gives about ₹299.2 on 2026 reported seller rates', () => {
    near(sellerFloor({ ...kurti(), policy: { rateSource: 'reported2026' } }).floor, 299.2)
  })

  it('reproduces the seller formula line by line', () => {
    const r = sellerFloor(kurti())
    const delivered = 100 * (1 - 0.17)
    const returns = delivered * 0.157
    const clean = delivered - returns
    const forward = delivered * 50
    const reverse = returns * 120
    const gst = 0.18 * (forward + reverse)
    const total = forward + reverse + gst + 100 * 8 + returns * 0.46 * 150
    expect(r.deliveredUnits).toBeCloseTo(delivered, 9)
    expect(r.cleanSales).toBeCloseTo(clean, 9)
    expect(r.totalOverhead).toBeCloseTo(total, 6)
    expect(r.floor).toBeCloseTo(150 + total / clean, 6)
  })

  it('charges the seller no COD fee and no RTO shipping', () => {
    const r = sellerFloor(kurti())
    expect(r.codCost).toBe(0)
    const keys = r.costLines.map((l) => l.key)
    expect(keys).not.toContain('cod')
    expect(keys).not.toContain('rtoReverse')
    expect(r.absorbedLines.map((l) => l.key)).toEqual(['rtoForward', 'rtoForwardGst', 'rtoReverse', 'cod'])
  })

  it('reports what Meesho absorbs per clean sale', () => {
    const r = sellerFloor(kurti())
    const rto = 17
    const absorbed = rto * 50 * 1.18 + rto * 120 + 100 * 0.8 * 7
    expect(meeshoAbsorbs(kurti()).total).toBeCloseTo(absorbed, 6)
    expect(meeshoAbsorbs(kurti()).perCleanSale).toBeCloseTo(absorbed / r.cleanSales, 6)
    // With the forward fee on RTOs charged to the seller, Meesho no longer absorbs it.
    const disputed = meeshoAbsorbs({ ...kurti(), policy: { forwardOnRto: true } })
    expect(disputed.lines.map((l) => l.key)).toEqual(['rtoReverse', 'cod'])
  })

  it('sits below full cost-to-serve', () => {
    for (const rr of [0.1, 0.157, 0.25]) {
      const input = { ...kurti(), returnRate: rr }
      expect(sellerFloor(input).floor).toBeLessThan(floor(input).floor)
    }
  })

  it('still rises with RTO, because every order is packed', () => {
    const at = (rtoCod: number) => sellerFloor({ ...kurti(), rtoCod }).floor
    expect(at(0.3)).toBeGreaterThan(at(0.2))
  })
})

describe('sellerFloor — "I am GST-registered" (default off)', () => {
  it('leaves the default kurti unchanged when off', () => {
    const r = sellerFloor(kurti())
    expect(r.outputGstRate).toBe(0)
    expect(r.netFloor).toBe(r.floor)
    expect(keepPerCleanSale(300, r)).toBeCloseTo(300 - r.floor, 9)
  })

  it('claims back the GST on Meesho’s fees and lists with 5% output GST when on', () => {
    const off = sellerFloor(kurti())
    const on = sellerFloor({ ...kurti(), policy: { gstRegistered: true } })
    const gstLine = on.costLines.find((l) => l.key === 'gst')!
    expect(gstLine.amount).toBe(0)
    expect(gstLine.working).toMatch(/claimed back as input credit/)
    // Net floor: COGS + overhead without the ₹1,028 of GST.
    const net = 150 + (off.totalOverhead - off.gstCost) / off.cleanSales
    expect(on.netFloor).toBeCloseTo(net, 6)
    expect(on.floor).toBeCloseTo(net * 1.05, 6)
    expect(Math.round(on.netFloor * 100) / 100).toBe(255.94)
    expect(Math.round(on.floor * 100) / 100).toBe(268.74)
    // At ₹300 the seller nets ₹300 ÷ 1.05 against the net floor.
    expect(keepPerCleanSale(300, on)).toBeCloseTo(300 / 1.05 - on.netFloor, 9)
  })
})
