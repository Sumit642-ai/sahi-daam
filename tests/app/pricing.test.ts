import { describe, expect, it } from 'vitest'

import type { Product, Report, SkuStatsRow } from '../../src/app/db'
import { whatToDo, whyTable } from '../../src/app/lib/floorCard'
import { autoStage, listedSince, orderTrend } from '../../src/app/lib/stage'
import { buildProductModel } from '../../src/app/productModel'
import { newShop } from '../../src/app/repo'
import { DEFAULT_SHOP, type KeepInput, defaultKeepInput, keepPerSale } from '../../src/engine/keep'
import {
  STAGES,
  market,
  minMargin,
  notViable,
  notViableFixes,
  priceRange,
  visibilityWarning,
} from '../../src/engine/priceHelper'

const kurti = (patch: Partial<KeepInput> = {}, gstRegistered = true): KeepInput => ({
  ...defaultKeepInput('ethnic_women', { cost: 150, price: 300, weightG: 350 }, { ...DEFAULT_SHOP, gstRegistered }),
  ...patch,
})
const FLOOR = 268.7421 // ENGINE.md, registered default kurti
const SAFE = 275 // ceil(floor + max(₹5, 2% of floor))
const MARKET = market([280, 300, 320, 340, 350])

describe('market from the prices the seller typed', () => {
  it('median, quarters, reliability', () => {
    expect(MARKET.median).toBe(320)
    expect(MARKET.p25).toBe(300)
    expect(MARKET.p75).toBe(340)
    expect(MARKET.reliable).toBe(true)
    expect(market([300, 320]).reliable).toBe(false)
  })

  it('flags outliers below 30% or above 300% of the median, and leaves them out', () => {
    const m = market([300, 310, 320, 80, 1000])
    expect(m.outliers).toEqual([3, 4])
    expect(m.used).toEqual([300, 310, 320])
    expect(m.median).toBe(310)
    // Just inside the limits is not an outlier.
    expect(market([300, 300, 300, 91, 899]).outliers).toEqual([])
  })
})

describe('stage ranges (spec 7.6)', () => {
  it('the minimum margin is ₹5 or 2% of the floor', () => {
    expect(minMargin(200)).toBe(5)
    expect(minMargin(FLOOR)).toBeCloseTo(5.3748, 4)
  })

  it('Launch: floor + margin → market middle', () => {
    const r = priceRange({ input: kurti(), currentPrice: 300, stage: 'LAUNCH', market: MARKET })
    expect(r.floor).toBeCloseTo(FLOOR, 4)
    expect([r.low, r.high, r.target]).toEqual([SAFE, 320, 320])
    expect(r.lifted).toBe(false)
  })

  it('Launch in a market whose middle is under the floor is lifted, never lowered', () => {
    const r = priceRange({ input: kurti(), currentPrice: 300, stage: 'LAUNCH', market: market([230, 250, 260]) })
    expect([r.low, r.high, r.target]).toEqual([SAFE, SAFE, SAFE])
    expect(r.lifted).toBe(true)
  })

  it('Launch with no prices yet still answers from the floor', () => {
    const r = priceRange({ input: kurti(), currentPrice: 300, stage: 'LAUNCH', market: null })
    expect([r.low, r.high]).toEqual([SAFE, SAFE])
  })

  it('Growing: current → +₹10', () => {
    const r = priceRange({ input: kurti(), currentPrice: 300, stage: 'GROWING', market: MARKET })
    expect([r.low, r.high, r.target]).toEqual([300, 310, 310])
    const below = priceRange({ input: kurti(), currentPrice: 260, stage: 'GROWING', market: MARKET })
    expect([below.low, below.target, below.lifted]).toEqual([SAFE, SAFE, true])
  })

  it('Growing holds while the last price step is still being judged (spec 7.9)', () => {
    const r = priceRange({ input: kurti(), currentPrice: 310, stage: 'GROWING', market: MARKET, recentStep: true })
    expect([r.low, r.high, r.target, r.waitingOnStep]).toEqual([310, 310, 310, true])
    // A price under the floor is still lifted, step or no step.
    const below = priceRange({ input: kurti(), currentPrice: 260, stage: 'GROWING', market: MARKET, recentStep: true })
    expect([below.target, below.waitingOnStep]).toEqual([SAFE, false])
  })

  it('Steady: hold, but never below the floor', () => {
    expect(priceRange({ input: kurti(), currentPrice: 300, stage: 'STEADY', market: MARKET }).target).toBe(300)
    expect(priceRange({ input: kurti(), currentPrice: 250, stage: 'STEADY', market: MARKET }).target).toBe(SAFE)
  })

  it('Clearing: 5% markdowns that stop at the floor', () => {
    const r = priceRange({ input: kurti(), currentPrice: 300, stage: 'CLEARING', market: MARKET })
    expect(r.ladder).toEqual([285, 270, 269])
    expect([r.low, r.high, r.target]).toEqual([269, 300, 285])
  })

  it('a product nothing survives has no range', () => {
    expect(priceRange({ input: kurti({ rtoRate: 1 }), currentPrice: 300, stage: 'LAUNCH', market: MARKET }).viable).toBe(false)
  })
})

describe('Section 15, positive 5: range ≥ floor; visibility warning above the top quarter', () => {
  it('every stage stays at or above the floor', () => {
    for (const stage of STAGES) {
      for (const current of [150, 260, 300, 500]) {
        const r = priceRange({ input: kurti(), currentPrice: current, stage, market: MARKET })
        for (const p of [r.low, r.high, r.target, ...r.ladder]) expect(p, `${stage} at ₹${current}`).toBeGreaterThanOrEqual(r.floor)
      }
    }
  })

  it('warns above the 75th percentile of the entered prices, and not otherwise', () => {
    expect(visibilityWarning(345, MARKET)).toBe(true)
    expect(visibilityWarning(340, MARKET)).toBe(false)
    expect(visibilityWarning(300, MARKET)).toBe(false)
  })

  it('never warns on fewer than 3 prices', () => {
    expect(visibilityWarning(9_999, market([300, 320]))).toBe(false)
    expect(visibilityWarning(9_999, null)).toBe(false)
  })
})

describe('Section 15, negative 3: two competitor prices → faded range', () => {
  it('is not reliable, and the range falls back to the floor', () => {
    const m = market([300, 320])
    expect(m.reliable).toBe(false)
    const r = priceRange({ input: kurti(), currentPrice: 300, stage: 'LAUNCH', market: m })
    expect(r.low).toBe(SAFE)
  })
})

describe('Section 15, negative 4: floor above every competitor price', () => {
  const cheap = market([199, 210, 220, 229])

  it('is not viable, and still never recommends below the floor', () => {
    expect(notViable(FLOOR, cheap)).toBe(true)
    expect(notViable(FLOOR, MARKET)).toBe(false)
    for (const stage of STAGES) {
      const r = priceRange({ input: kurti(), currentPrice: 220, stage, market: cheap })
      expect(r.target, stage).toBeGreaterThanOrEqual(r.floor)
      expect(r.low, stage).toBeGreaterThanOrEqual(r.floor)
    }
  })

  it('an outlier price above the floor does not make it viable', () => {
    expect(notViable(FLOOR, market([200, 210, 220, 900]))).toBe(true)
  })

  it('offers the four fixes, each with its new floor', () => {
    const fixes = notViableFixes(kurti(), 350)
    expect(fixes.map((f) => f.id)).toEqual(['prepaid', 'lighter', 'bundle', 'cost'])
    for (const f of fixes) expect(f.floor, f.id).toBeLessThan(FLOOR)
    // Already in the lightest slab: halve the packaging instead.
    expect(fixes[1]!.detail).toEqual({ packagingFrom: 8, packagingTo: 4 })
    // Bundle of 2: per-order costs shared.
    expect(fixes[2]!.floor).toBeCloseTo(keepPerSale(kurti({ cost: 300 })).floor / 2, 6)
    expect(fixes[3]!.floor).toBeCloseTo(keepPerSale(kurti({ cost: 135 })).floor, 6)
  })

  it('a 600 g parcel is told to get under 500 g, saving the slab difference on what it pays', () => {
    const saree = kurti({ fwdPerDelivered: 70, revPerReturn: 150 })
    const lighter = notViableFixes(saree, 600)[1]!
    expect(lighter.detail).toEqual({ targetG: 500, shedG: 100 })
    expect(lighter.floor).toBeCloseTo(keepPerSale({ ...saree, fwdPerDelivered: 50, revPerReturn: 120 }).floor, 6)
  })
})

describe('Section 15, negative 5: guardrail property test (1,000 random inputs)', () => {
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

  it('no stage ever recommends below the floor, registered or not', () => {
    const rnd = mulberry32(0xc0ffee)
    let checked = 0
    for (let i = 0; i < 1_000; i++) {
      const input: KeepInput = {
        price: Math.round(50 + rnd() * 1500),
        cost: Math.round(20 + rnd() * 900),
        fwdPerDelivered: 30 + rnd() * 120,
        revPerReturn: 60 + rnd() * 250,
        rtoRate: rnd() * 0.6,
        returnRate: rnd() * 0.5,
        unsellableShare: rnd(),
        packagingPerOrder: rnd() * 40,
        adPerOrder: rnd() * 30,
        penaltiesPerOrder: rnd() * 5,
        gstRegistered: rnd() < 0.5,
        outputGstRate: [0, 0.03, 0.05, 0.12, 0.18][Math.floor(rnd() * 5)]!,
        fwdOnRto: rnd() < 0.3,
      }
      const prices = Array.from({ length: Math.floor(rnd() * 11) }, () => Math.round(20 + rnd() * 2000))
      const m = prices.length > 0 ? market(prices) : null
      for (const stage of STAGES) {
        const r = priceRange({ input, currentPrice: Math.round(rnd() * 2000), stage, market: m })
        if (!r.viable) continue
        checked++
        for (const p of [r.low, r.high, r.target, ...r.ladder]) {
          if (!(p >= r.floor)) throw new Error(`Guardrail broken: ${stage} ₹${p} < floor ₹${r.floor} — ${JSON.stringify(input)}`)
        }
        expect(keepPerSale({ ...input, price: r.target }).keep).toBeGreaterThanOrEqual(-1e-9)
      }
    }
    expect(checked).toBeGreaterThan(3_500)
  })
})

describe('"What to do" (spec 7.6)', () => {
  it('the default kurti: prepaid worth under ₹1 is left out; the price suggestion stays', () => {
    const actions = whatToDo({ input: kurti(), categoryId: 'ethnic_women', codHeavy: true, recommendedPrice: 320 })
    expect(actions.map((a) => a.id)).toEqual(['price'])
    expect(actions[0]!.newKeep).toBeCloseTo(keepPerSale(kurti({ price: 320 })).keep, 6)
    expect(actions[0]!.effect).toBeCloseTo(320 / 1.05 - 300 / 1.05, 6)
  })

  it('returns above the category norm → "fix the listing", worth returns −5 points', () => {
    const input = kurti({ returnRate: 0.23 })
    const [a] = whatToDo({ input, categoryId: 'ethnic_women', codHeavy: false, recommendedPrice: null })
    expect(a!.id).toBe('listing')
    expect(a!.newKeep).toBeCloseTo(keepPerSale(kurti({ returnRate: 0.18 })).keep, 6)
  })

  it('prepaid matters once RTO costs real money (forward fee on RTOs)', () => {
    const input = kurti({ rtoRate: 0.3, fwdOnRto: true })
    const actions = whatToDo({ input, categoryId: 'ethnic_women', codHeavy: true, recommendedPrice: null })
    expect(actions[0]!.id).toBe('prepaid')
    expect(actions[0]!.effect).toBeGreaterThanOrEqual(1)
  })

  it('in order, at most three', () => {
    const input = kurti({ rtoRate: 0.3, fwdOnRto: true, returnRate: 0.25 })
    const actions = whatToDo({ input, categoryId: 'ethnic_women', codHeavy: true, recommendedPrice: 350 })
    expect(actions.map((a) => a.id)).toEqual(['prepaid', 'listing', 'price'])
  })
})

describe('the "Why" table adds up', () => {
  it.each([true, false])('registered %s: lines → what each sale must bring in → floor', (gst) => {
    const input = kurti({ adPerOrder: 4, penaltiesPerOrder: 1 }, gst)
    const r = keepPerSale(input)
    const t = whyTable(input, r)
    const net = t.lines.filter((l) => l.key !== 'outputGst').reduce((s, l) => s + l.perSale, 0)
    expect(net).toBeCloseTo(r.netFloor, 9)
    expect(t.floor).toBeCloseTo(r.floor, 9)
    const feeGst = t.lines.find((l) => l.key === 'feeGst')!
    expect(feeGst.perSale).toBeCloseTo(gst ? 0 : r.lines.feeGst / r.C, 9)
    expect(t.lines.some((l) => l.key === 'outputGst')).toBe(gst)
    expect(t.lines.map((l) => l.key)).not.toContain('rtoReverse') // no Meesho-cost lines
  })
})

describe('stage, auto-set and editable', () => {
  const DAY = 86_400_000
  const now = Date.parse('2026-10-20T00:00:00')

  it('by days listed', () => {
    expect(autoStage({ since: now - 10 * DAY, trend: null, now })).toBe('LAUNCH')
    expect(autoStage({ since: now - 45 * DAY, trend: null, now })).toBe('GROWING')
    expect(autoStage({ since: now - 120 * DAY, trend: null, now })).toBe('STEADY')
    expect(autoStage({ since: now - 120 * DAY, trend: -0.35, now })).toBe('CLEARING')
    expect(autoStage({ since: now - 45 * DAY, trend: -0.5, now })).toBe('GROWING')
  })

  const reports: Report[] = [
    { id: 'r1', fileHash: 'a', fileName: 'w1', periodFrom: '2026-06-01', periodTo: '2026-06-07', periodDays: 7, uploadedAt: 1, orderLines: 0, productCount: 1, synthetic: false, adsSplitByOrders: false },
    { id: 'r2', fileHash: 'b', fileName: 'w2', periodFrom: '2026-06-08', periodTo: '2026-06-14', periodDays: 7, uploadedAt: 2, orderLines: 0, productCount: 1, synthetic: false, adsSplitByOrders: false },
  ]
  const row = (reportId: string, orders: number): SkuStatsRow => ({
    id: reportId, reportId, productId: '', sku: 'K-1', productName: 'K', orders, delivered: orders, deliveredKept: orders, rto: 0, returns: 0, cancelled: 0,
    avgPrice: 300, avgShip: 59, avgReturnShip: null, forwardChargedOnRto: false, ads: null, penalties: null, tcsTds: 0, netSettlement: 0, avgSettlement: 239,
  })

  it('order trend compares orders a day in the last two reports', () => {
    expect(orderTrend('k-1', [row('r1', 100), row('r2', 60)], reports)).toBeCloseTo(-0.4, 10)
    expect(orderTrend('k-1', [row('r2', 60)], reports)).toBeNull()
  })

  it('a product added today from an old report is not a launch', () => {
    const p = { id: 'p', name: 'K', sku: 'K-1', category: 'ethnic_women', cost: 150, weightG: 350, price: 300, createdAt: now, updatedAt: now } as Product
    expect(listedSince(p, [row('r1', 100)], reports)).toBe(Date.parse('2026-06-01T00:00:00'))
  })
})

describe('price priority: report vs the seller', () => {
  const shop = newShop('en', 0)
  const report: Report = { id: 'r', fileHash: 'h', fileName: 'w', periodFrom: '2026-10-01', periodTo: '2026-10-07', periodDays: 7, uploadedAt: 5_000, orderLines: 0, productCount: 1, synthetic: false, adsSplitByOrders: false }
  const stats: SkuStatsRow = {
    id: 's', reportId: 'r', productId: 'p', sku: 'K-1', productName: 'K', orders: 120, delivered: 100, deliveredKept: 84, rto: 20, returns: 16, cancelled: 0,
    avgPrice: 300, avgShip: 59, avgReturnShip: 141.6, forwardChargedOnRto: false, ads: null, penalties: null, tcsTds: 0, netSettlement: 0, avgSettlement: 170,
  }
  const links = new Map([['K-1', { row: stats, report }]])
  const product = (priceSetAt?: number): Product => ({ id: 'p', name: 'K', sku: 'K-1', category: 'ethnic_women', cost: 150, weightG: 350, price: 330, createdAt: 0, updatedAt: 0, priceSetAt })

  it('the report price wins over a price typed before it arrived', () => {
    const m = buildProductModel({ product: product(1_000), shop, links, rows: [stats], reports: [report], competitorPrices: [] })
    expect(m.summary.input.price).toBe(300)
  })

  it('a price set after the report ("Use this price") wins', () => {
    const m = buildProductModel({ product: product(9_000), shop, links, rows: [stats], reports: [report], competitorPrices: [] })
    expect(m.summary.input.price).toBe(330)
    expect(m.summary.input.sources?.price).toBe('YOU_ENTERED')
  })
})
