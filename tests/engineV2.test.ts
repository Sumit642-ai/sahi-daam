import { describe, expect, it } from 'vitest'

import { categories } from '../src/data'
import { bandFor } from '../src/engine/band'
import {
  OUTPUT_GST,
  defaultFloorInput,
  floorRange,
  sellerFloor,
  slabFor,
  type FloorInput,
} from '../src/engine/floor'
import {
  DEFAULT_SHOP,
  defaultKeepInput,
  keepIfReturnsRise,
  keepPerSale,
  rtoPrior,
  sourceOf,
  withPrepaidPush,
  type KeepInput,
} from '../src/engine/keep'
import { STAGES, recommend } from '../src/engine/recommend'
import { reconcile, summariseOrders, type OrderRow } from '../src/engine/report'
import { breakEvenLift, saleLiftCheck } from '../src/engine/saleLift'
import { loadOrderRows, SYNTHETIC_DIR } from './fixtures/reports/loadReport'

/** The default kurti: ₹150 cost, ₹300 price, 350 g, everything else estimated. */
const kurti = (gstRegistered = true): KeepInput =>
  defaultKeepInput(
    'ethnic_women',
    { cost: 150, price: 300, weightG: 350 },
    { ...DEFAULT_SHOP, gstRegistered },
  )

// ---------------------------------------------------------------------------
// Spec v2 6.5, test 1 — registered vs unregistered on the default kurti
// ---------------------------------------------------------------------------

describe('6.5 test 1 — default kurti, GST-registered vs not', () => {
  // Hand working (ENGINE.md): R 17, D 83, Q 13.031, C 69.969.
  // forward 83 × ₹50 = ₹4,150 · reverse 13.031 × ₹120 = ₹1,563.72
  // fee GST 18% × ₹5,713.72 = ₹1,028.47 · packaging ₹800 · write-off ₹899.14
  const reg = keepPerSale(kurti(true))
  const unreg = keepPerSale(kurti(false))

  it('defaults to a registered shop with mixed buyers and 17% RTO', () => {
    expect(DEFAULT_SHOP.gstRegistered).toBe(true)
    expect(kurti().rtoRate).toBeCloseTo(0.17, 10)
    expect(kurti().outputGstRate).toBe(0.05)
  })

  it('registered: costs ₹7,412.86, keep ₹29.77, floor ₹268.74', () => {
    expect(reg.C).toBeCloseTo(69.969, 6)
    expect(reg.lines.feeGstCost).toBe(0)
    expect(reg.costs).toBeCloseTo(7412.859, 3)
    expect(reg.pNet).toBeCloseTo(285.7143, 4)
    expect(reg.keep).toBeCloseTo(29.7694, 4)
    expect(reg.floor).toBeCloseTo(268.7421, 4)
  })

  it('unregistered: costs ₹8,441.33, keep ₹29.36, floor ₹270.64', () => {
    expect(unreg.lines.feeGstCost).toBeCloseTo(1028.4696, 4)
    expect(unreg.costs).toBeCloseTo(8441.3286, 4)
    expect(unreg.pNet).toBe(300)
    expect(unreg.keep).toBeCloseTo(29.3562, 4)
    expect(unreg.floor).toBeCloseTo(270.6438, 4)
  })

  it('differs by exactly fee GST ÷ C − output GST in the price (₹0.41 a sale)', () => {
    const expected = reg.lines.feeGst / reg.C - (300 * 0.05) / 1.05
    expect(reg.keep - unreg.keep).toBeCloseTo(expected, 10)
    expect(reg.keep - unreg.keep).toBeCloseTo(0.4132, 4)
    expect(unreg.floor - reg.floor).toBeCloseTo(1.9017, 4)
  })

  it('agrees with the prototype sellerFloor() for both settings', () => {
    for (const gstRegistered of [true, false]) {
      const proto = sellerFloor({
        ...defaultFloorInput('ethnic_women', { cogs: 150, weightG: 350 }),
        policy: { gstRegistered },
      })
      expect(keepPerSale(kurti(gstRegistered)).floor).toBeCloseTo(proto.floor, 9)
    }
  })

  it('shows "if returns rise 5 points" under the main number', () => {
    const up = keepIfReturnsRise(kurti(true))
    expect(up.keep).toBeCloseTo(11.1726, 4)
    expect(up.floor).toBeCloseTo(288.2688, 4)
  })

  it('tags typed values YOU_ENTERED and the rest ESTIMATED', () => {
    expect(sourceOf(kurti(), 'cost')).toBe('YOU_ENTERED')
    expect(sourceOf(kurti(), 'price')).toBe('YOU_ENTERED')
    expect(sourceOf(kurti(), 'rtoRate')).toBe('ESTIMATED')
    expect(sourceOf(kurti(), 'fwdPerDelivered')).toBe('ESTIMATED')
  })

  it('works out the monthly figure from clean sales a month', () => {
    const r = keepPerSale({ ...kurti(), cleanSalesPerMonth: 70 })
    expect(r.monthly).toBeCloseTo(70 * r.keep, 10)
    expect(keepPerSale(kurti()).monthly).toBeNull()
  })

  it('reports no break-even price when nothing survives', () => {
    const r = keepPerSale({ ...kurti(), rtoRate: 1 })
    expect(r.viable).toBe(false)
    expect(r.floor).toBe(Number.POSITIVE_INFINITY)
    expect(r.keep).toBe(Number.NEGATIVE_INFINITY)
  })
})

describe('shop-setup RTO prior', () => {
  it('is 17% for mixed buyers, lower in big cities, higher in small towns', () => {
    expect(rtoPrior('mixed', false)).toBeCloseTo(0.17, 10)
    expect(rtoPrior('big_cities', false)).toBeCloseTo(0.13, 10)
    expect(rtoPrior('small_towns', false)).toBeCloseTo(0.21, 10)
  })

  it('drops by 3 points with a prepaid discount', () => {
    expect(rtoPrior('mixed', true)).toBeCloseTo(0.14, 10)
    expect(withPrepaidPush(kurti()).rtoRate).toBeCloseTo(0.14, 10)
  })

  it('never pushes RTO below the prepaid rate', () => {
    expect(withPrepaidPush({ ...kurti(), rtoRate: 0.06 }).rtoRate).toBeCloseTo(0.05, 10)
    expect(withPrepaidPush({ ...kurti(), rtoRate: 0.02 }).rtoRate).toBe(0.02)
  })
})

// ---------------------------------------------------------------------------
// 6.5 test 2 — ads lower keep by exactly adPerOrder × N ÷ C
// ---------------------------------------------------------------------------

describe('6.5 test 2 — ads', () => {
  it.each([true, false])('₹6 an order lowers keep by 6 × 100 ÷ C (registered %s)', (gst) => {
    const base = keepPerSale(kurti(gst))
    const withAds = keepPerSale({ ...kurti(gst), adPerOrder: 6 })
    expect(base.keep - withAds.keep).toBeCloseTo((6 * 100) / base.C, 10)
    expect(withAds.lines.ads).toBe(600)
  })

  it('penalties work the same way, per dispatched order', () => {
    const base = keepPerSale(kurti())
    const withPen = keepPerSale({ ...kurti(), penaltiesPerOrder: 2.5 })
    expect(base.keep - withPen.keep).toBeCloseTo((2.5 * 100) / base.C, 10)
  })
})

// ---------------------------------------------------------------------------
// 6.5 test 3 — reconciliation against the fixture report
// ---------------------------------------------------------------------------

describe('6.5 test 3 — reconciliation', () => {
  const week1 = loadOrderRows(`${SYNTHETIC_DIR}/SAMPLE_SYNTHETIC_PAYMENT_FILE_week1.xlsx`)
  const kurtiRows = week1.rows.filter((r) => r.sku === 'KURTI-BLUE-01')

  it('week 1 kurti is within 5% of the model → "matches"', () => {
    const stats = summariseOrders(kurtiRows).get('KURTI-BLUE-01')!
    const rec = reconcile(kurti(), stats)
    expect(rec.status).toBe('MATCHES')
    expect(Math.abs(rec.differencePct)).toBeLessThanOrEqual(0.05)
    expect(rec.report).toBeCloseTo((16_889.08 + 84 * 1.73) / 100, 6)
    expect(rec.gapLines).toEqual([])
    // The report's numbers are used even when they match (hard rule 1).
    expect(sourceOf(rec.calibrated, 'returnRate')).toBe('FROM_REPORT')
    expect(rec.calibrated.returnRate).toBeCloseTo(0.16, 10)
  })

  it('a perturbed copy (₹30 more shipping a parcel) differs → uses the report values', () => {
    const perturbed: OrderRow[] = kurtiRows.map((r) => {
      if (r.status !== 'Delivered' && r.status !== 'Return') return r
      return { ...r, shipping: (r.shipping ?? 0) - 30, settlement: r.settlement - 30 }
    })
    const stats = summariseOrders(perturbed).get('KURTI-BLUE-01')!
    const rec = reconcile(kurti(), stats)

    expect(rec.status).toBe('DIFFERS')
    // 100 delivered parcels × ₹30 off the settlement = ₹30 less per delivered order.
    const before = summariseOrders(kurtiRows).get('KURTI-BLUE-01')!
    expect(rec.report).toBeCloseTo(before.avgSettlementPerDelivered! - 30, 9)
    expect(Math.abs(rec.differencePct)).toBeGreaterThan(0.05)
    expect(rec.calibrated.fwdPerDelivered).toBeCloseTo(89 / 1.18, 10)
    expect(sourceOf(rec.calibrated, 'fwdPerDelivered')).toBe('FROM_REPORT')
    expect(rec.gapLines[0]!.field).toBe('fwdPerDelivered')
    // Re-running the model on the calibrated input closes the gap.
    const again = reconcile(rec.calibrated, stats)
    expect(again.status).toBe('MATCHES')
    expect(Math.abs(again.difference)).toBeLessThan(0.01)
  })

  it('week 2 kurti (returns 16% → 23%) differs and names the return rate', () => {
    const week2 = loadOrderRows(`${SYNTHETIC_DIR}/SAMPLE_SYNTHETIC_PAYMENT_FILE_week2.xlsx`)
    const stats = summariseOrders(week2.rows).get('KURTI-BLUE-01')!
    const rec = reconcile(kurti(), stats)
    expect(rec.status).toBe('DIFFERS')
    expect(rec.gapLines[0]!.field).toBe('returnRate')
    expect(rec.calibrated.returnRate).toBeCloseTo(0.23, 10)
  })

  it('keeps estimated rates under 20 orders ("Low data") but still uses actual fees', () => {
    const few = kurtiRows.slice(0, 15)
    const stats = summariseOrders(few).get('KURTI-BLUE-01')!
    expect(stats.lowData).toBe(true)
    const rec = reconcile(kurti(), stats)
    expect(rec.lowData).toBe(true)
    expect(rec.calibrated.rtoRate).toBe(kurti().rtoRate)
    expect(sourceOf(rec.calibrated, 'rtoRate')).toBe('ESTIMATED')
    expect(sourceOf(rec.calibrated, 'fwdPerDelivered')).toBe('FROM_REPORT')
  })
})

// ---------------------------------------------------------------------------
// 6.5 test 4 — break-even lift (7.7): join / join only with prepaid / skip
// ---------------------------------------------------------------------------

describe('6.5 test 4 — break-even lift', () => {
  it('lift = keep ÷ keepAtSale − 1, exactly', () => {
    expect(breakEvenLift(30, 20)).toBeCloseTo(0.5, 12)
    expect(breakEvenLift(30, 0)).toBeNull()
    expect(breakEvenLift(-5, 10)).toBeNull()
  })

  it('JOIN: ₹500 kurti, 10% off → needs 27.6% more orders', () => {
    const s = saleLiftCheck({ input: { ...kurti(), price: 500 }, discount: 0.1 })
    expect(s.salePrice).toBe(450)
    expect(s.plain.lift).toBeCloseTo(s.plain.now.keep / s.plain.atSale.keep - 1, 12)
    expect(s.plain.lift!).toBeCloseTo(0.2759, 4)
    expect(s.verdict).toBe('JOIN')
  })

  it('JOIN_WITH_PREPAID: just over 30% plain, under 30% once RTO drops', () => {
    // RTO 30% with the forward fee charged on RTOs, so RTO really costs money.
    const input = { ...kurti(), price: 520, rtoRate: 0.3, fwdOnRto: true }
    const s = saleLiftCheck({ input, discount: 0.1 })
    expect(s.salePrice).toBe(468)
    expect(s.plain.lift!).toBeCloseTo(0.3053, 4)
    expect(s.withPrepaid.lift!).toBeCloseTo(0.2979, 4)
    expect(s.withPrepaid.now.R).toBeCloseTo(27, 9)
    expect(s.verdict).toBe('JOIN_WITH_PREPAID')
  })

  it('SKIP_LOSS: default ₹300 kurti, 20% off → every sale order loses ₹27.37', () => {
    const s = saleLiftCheck({ input: kurti() })
    expect(s.discount).toBe(0.2)
    expect(s.salePrice).toBe(240)
    expect(s.plain.lift).toBeNull()
    expect(s.lossPerSaleOrder).toBeCloseTo(27.3735, 4)
    expect(s.verdict).toBe('SKIP_LOSS')
  })

  it("SKIP_LIFT unless the seller's own guess beats the lift", () => {
    const input = { ...kurti(), price: 400 }
    expect(saleLiftCheck({ input, discount: 0.1 }).verdict).toBe('SKIP_LIFT')
    expect(saleLiftCheck({ input, discount: 0.1, sellerGuessLift: 0.5 }).verdict).toBe('JOIN')
  })

  it('FIX_PRICE_FIRST when the product already loses money', () => {
    const s = saleLiftCheck({ input: { ...kurti(), price: 260 } })
    expect(s.plain.now.keep).toBeLessThan(0)
    expect(s.verdict).toBe('FIX_PRICE_FIRST')
  })
})

// ---------------------------------------------------------------------------
// 6.5 test 5 — guardrail property test, registered and unregistered
// ---------------------------------------------------------------------------

describe('6.5 test 5 — guardrail: recommendation ≥ floor, registered and not', () => {
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
  const CATEGORY_IDS = categories.map((c) => c.id)

  it('holds over 1,000 random inputs × 4 stages × both GST settings', { timeout: 60_000 }, () => {
    const rnd = mulberry32(0x6a5e2)
    let checked = 0
    for (let i = 0; i < 1_000; i += 1) {
      const categoryId = CATEGORY_IDS[Math.floor(rnd() * CATEGORY_IDS.length)]!
      const band = bandFor(categoryId)
      const base: FloorInput = {
        ...defaultFloorInput(categoryId),
        cogs: Math.round(20 + rnd() * 900),
        weightG: Math.round(50 + rnd() * 3_000),
        codShare: rnd(),
        rtoCod: rnd() * 0.6,
        rtoPrepaid: rnd() * 0.2,
        writeOffShare: rnd(),
        packagingCost: Math.round(rnd() * 40),
        adSpendPerOrder: Math.round(rnd() * 25),
      }
      const context = {
        currentPrice: Math.round(10 + rnd() * 900),
        launchPrice: Math.round(10 + rnd() * 900),
        learnedBestPrice: Math.round(10 + rnd() * 900),
        competitorUndercut: rnd() < 0.5,
        competitorMedian: Math.round(10 + rnd() * 900),
        stockCoverWeeks: Math.round(rnd() * 20),
        weeksInStage: Math.round(rnd() * 40),
      }

      for (const gstRegistered of [true, false]) {
        const input: FloorInput = { ...base, policy: { gstRegistered } }
        const range = floorRange(input)
        // The same product through engine v2.
        const v2In = v2Input(input, range.returnRates.expected, gstRegistered)
        const v2 = keepPerSale(v2In)
        expect(v2.floor).toBeCloseTo(range.expected, 6)

        for (const stage of STAGES) {
          const rec = recommend(stage, range, band, context)
          checked += 1
          if (!(rec.price >= v2.floor - 1e-9)) {
            throw new Error(
              `Guardrail broken (registered ${gstRegistered}): ${categoryId}/${stage} ` +
                `₹${rec.price} < floor ₹${v2.floor.toFixed(2)} — ${JSON.stringify(input)}`,
            )
          }
          // So listing there never keeps less than ₹0 a sale.
          expect(keepPerSale({ ...v2In, price: rec.price }).keep).toBeGreaterThanOrEqual(-1e-9)
        }
      }
    }
    expect(checked).toBe(8_000)
  })

  /** A prototype FloorInput as a v2 KeepInput (season index 1, no penalties). */
  function v2Input(input: FloorInput, returnRate: number, gstRegistered: boolean): KeepInput {
    const slab = slabFor(input.weightG)
    return {
      price: 0,
      cost: input.cogs,
      fwdPerDelivered: slab.forward,
      revPerReturn: slab.reverse,
      rtoRate: input.codShare * input.rtoCod + (1 - input.codShare) * input.rtoPrepaid,
      returnRate,
      unsellableShare: input.writeOffShare,
      packagingPerOrder: input.packagingCost,
      adPerOrder: input.adSpendPerOrder ?? 0,
      penaltiesPerOrder: 0,
      gstRegistered,
      outputGstRate: OUTPUT_GST,
      fwdOnRto: false,
    }
  }
})

// ---------------------------------------------------------------------------
// 6.5 test 6 — TCS / TDS never change keep
// ---------------------------------------------------------------------------

describe('6.5 test 6 — TCS / TDS', () => {
  it.each([true, false])('never move keep or floor (registered %s)', (gst) => {
    const base = keepPerSale(kurti(gst))
    const taxed = keepPerSale({ ...kurti(gst), tcsTdsPerDelivered: 1.73 })
    expect(taxed.keep).toBe(base.keep)
    expect(taxed.floor).toBe(base.floor)
    expect(taxed.costs).toBe(base.costs)
    expect(taxed.taxDeductedClaimable).toBeCloseTo(83 * 1.73, 9)
  })

  it('a report full of TCS / TDS calibrates to the same keep as one without', () => {
    const { rows } = loadOrderRows(`${SYNTHETIC_DIR}/SAMPLE_SYNTHETIC_PAYMENT_FILE_week1.xlsx`)
    const kurtiRows = rows.filter((r) => r.sku === 'KURTI-BLUE-01')
    const noTax = kurtiRows.map((r) => ({
      ...r,
      settlement: r.settlement - (r.tcs ?? 0) - (r.tds ?? 0),
      tcs: 0,
      tds: 0,
    }))
    const a = reconcile(kurti(), summariseOrders(kurtiRows).get('KURTI-BLUE-01')!)
    const b = reconcile(kurti(), summariseOrders(noTax).get('KURTI-BLUE-01')!)
    expect(a.calibrated.tcsTdsPerDelivered).toBeGreaterThan(0)
    expect(keepPerSale(a.calibrated).keep).toBeCloseTo(keepPerSale(b.calibrated).keep, 10)
    expect(a.report).toBeCloseTo(b.report, 10)
  })
})
