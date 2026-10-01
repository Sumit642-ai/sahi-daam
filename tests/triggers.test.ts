import { describe, expect, it } from 'vitest'

import { bandFor, nearestListings, withUndercut } from '../src/engine/band'
import { defaultFloorInput, floorRange } from '../src/engine/floor'
import { nudgeFor, nudgeText } from '../src/engine/nudges'
import {
  THRESHOLDS,
  TRIGGER_IDS,
  checkT1,
  checkT2,
  checkT3,
  checkT4,
  checkT5,
  checkT6,
  checkTrigger,
  evaluateTriggers,
  type TriggerContext,
} from '../src/engine/triggers'

/**
 * Spec section 10, test 7 — "each of T1–T6 fires at its threshold and does not
 * fire just below it."
 *
 * Each rule is probed on the comparison its own spec text uses. T1 ("≥ baseline
 * + 5pp") and T2 ("≥ 1.4") fire exactly AT the threshold. T3 ("drops > 8%") and
 * T5 ("changes by > 5%") are strict, so the threshold value itself must NOT
 * fire and the test probes a hair above instead. T6 has no numeric threshold —
 * its boundary is "a price change happened at all".
 */

const input = defaultFloorInput('ethnic_women')
const range = floorRange(input)
const band = bandFor('ethnic_women')

/** Week 1 of the journey (spec section 7): Monday 6 July 2026, a quiet month. */
const JULY = new Date(2026, 6, 6)

function ctx(patch: Partial<TriggerContext> = {}): TriggerContext {
  return {
    week: 12,
    date: JULY,
    input,
    range,
    band,
    price: 330,
    ...patch,
  }
}

// ---------------------------------------------------------------------------

describe('test 7 — T1, return rate climbs', () => {
  const baseline = 0.157
  const at = baseline + THRESHOLDS.T1_RETURN_RATE_PP // 0.207
  const below = at - 0.001

  it('fires when the last two weeks average exactly baseline + 5pp', () => {
    const alert = checkT1(ctx({ baselineReturnRate: baseline, recentReturnRates: [at, at] }))
    expect(alert).not.toBeNull()
    expect(alert!.id).toBe('T1')
  })

  it('does not fire just below the threshold', () => {
    expect(
      checkT1(ctx({ baselineReturnRate: baseline, recentReturnRates: [below, below] })),
    ).toBeNull()
  })

  it('averages the last two weeks, not the whole history', () => {
    // A calm history cannot rescue two bad weeks...
    expect(
      checkT1(ctx({ baselineReturnRate: baseline, recentReturnRates: [0.05, 0.05, at, at] })),
    ).not.toBeNull()
    // ...and two bad weeks long ago do not keep firing once it settles.
    expect(
      checkT1(ctx({ baselineReturnRate: baseline, recentReturnRates: [0.4, 0.4, baseline, baseline] })),
    ).toBeNull()
  })

  it('needs two weeks of data before it can say anything', () => {
    expect(checkT1(ctx({ baselineReturnRate: baseline, recentReturnRates: [0.9] }))).toBeNull()
    expect(checkT1(ctx({ baselineReturnRate: baseline, recentReturnRates: [] }))).toBeNull()
  })

  it('reports the floor move and a price that clears it', () => {
    const alert = checkT1(ctx({ baselineReturnRate: baseline, recentReturnRates: [0.26, 0.26] }))!
    expect(Number(alert.numbers.floorNew)).toBeGreaterThan(Number(alert.numbers.floorOld))
    expect(Number(alert.numbers.suggested)).toBeGreaterThan(Number(alert.numbers.floorNew))
    expect(alert.action).toMatch(/Your floor moved from ₹[\d,]+ to ₹[\d,]+\. Raise price to ₹[\d,]+/)
    expect(alert.action).toContain('size chart, photos')
  })
})

describe('test 7 — T2, festive RTO spike', () => {
  it('fires when the season index ahead is exactly 1.4', () => {
    const alert = checkT2(ctx({ seasonIndexAhead: THRESHOLDS.T2_SEASON_INDEX }))
    expect(alert).not.toBeNull()
    expect(alert!.id).toBe('T2')
  })

  it('does not fire just below 1.4', () => {
    expect(checkT2(ctx({ seasonIndexAhead: 1.399 }))).toBeNull()
  })

  it('reads the real calendar two weeks ahead', () => {
    // Late September 2026 is still 1.00, but October (1.60) is inside the
    // two-week lookahead, so the warning arrives before the ramp starts.
    expect(checkT2(ctx({ date: new Date(2026, 8, 28) }))).not.toBeNull()
    // Mid-September sees only 1.00 ahead of it.
    expect(checkT2(ctx({ date: new Date(2026, 8, 7) }))).toBeNull()
    // July is quiet.
    expect(checkT2(ctx({ date: JULY }))).toBeNull()
    // December is exactly 1.40 — the boundary month.
    expect(checkT2(ctx({ date: new Date(2026, 11, 7) }))).not.toBeNull()
  })

  it('raises the floor and says by how much', () => {
    const alert = checkT2(ctx({ seasonIndexAhead: 1.867 }))!
    expect(Number(alert.numbers.floorNew)).toBeGreaterThan(Number(alert.numbers.floorOld))
    expect(alert.action).toMatch(
      /^Festive RTO will lift your floor from ₹[\d,]+ to ₹[\d,]+\. Reprice before the peak\.$/,
    )
  })
})

describe('test 7 — T3, competitor undercut', () => {
  /** A price whose five nearest listings sit a given fraction below it. */
  function priceWithUndercut(fraction: number): number {
    // Solve for the price whose nearest-5 median is `fraction` below it by
    // scanning; the band is discrete, so an exact algebraic answer is unlikely.
    for (let price = Math.round(band.min); price <= Math.round(band.max * 1.6); price += 1) {
      const median = nearestMedianOf(price)
      if ((price - median) / price >= fraction) return price
    }
    throw new Error(`no price in this band is undercut by ${fraction}`)
  }
  function nearestMedianOf(price: number): number {
    const near = [...band.listings]
      .sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price))
      .slice(0, 5)
      .map((l) => l.price)
      .sort((a, b) => a - b)
    return near[2]!
  }

  it('fires when the nearest-5 median is more than 8% below you', () => {
    const price = priceWithUndercut(THRESHOLDS.T3_UNDERCUT + 0.005)
    const alert = checkT3(ctx({ price }))
    expect(alert).not.toBeNull()
    expect(alert!.id).toBe('T3')
    expect(Number(alert!.numbers.dropPct)).toBeGreaterThan(8)
  })

  it('does not fire at or below exactly 8%, because the rule is strict', () => {
    // Construct the exact boundary: a median precisely 8% under the price.
    const median = nearestMedianOf(300)
    const exactly8 = median / (1 - THRESHOLDS.T3_UNDERCUT)
    expect(checkT3(ctx({ price: exactly8 }))).toBeNull()
    expect(checkT3(ctx({ price: exactly8 * 0.999 }))).toBeNull()
  })

  it('says "is safe" when matching would still clear the floor', () => {
    const cheap = floorRange(defaultFloorInput('ethnic_women', { cogs: 40 }))
    const price = priceWithUndercut(0.15)
    const alert = checkT3(ctx({ price, range: cheap }))!
    expect(Number(alert.numbers.safe)).toBe(1)
    expect(alert.action).toContain('is safe')
    expect(alert.action).toContain('Re-check your floor')
  })

  it('tracks the competitors you had, not whoever is nearest now', () => {
    // The journey's week-12 event: the five listings nearest you cut 10%.
    const price = 324
    const cohort = nearestListings(band, price).map((l) => l.id)
    const cut = withUndercut(band, price, 0.1)

    // Without a cohort the trigger is blind: five other listings have simply
    // taken their place next to your price, so the nearest-5 median has not
    // moved. This is the case that made the rule unfireable in a dense band.
    expect(checkT3(ctx({ price, band: cut }))).toBeNull()

    const alert = checkT3(ctx({ price, band: cut, competitorCohort: cohort }))!
    expect(alert).not.toBeNull()
    expect(Number(alert.numbers.dropPct)).toBeCloseTo(10, 0)
    expect(alert.numbers.rivals).toBe(5)
  })

  it('quantifies the loss when matching would go below the floor', () => {
    const price = priceWithUndercut(0.15)
    const alert = checkT3(ctx({ price }))!
    if (Number(alert.numbers.safe) === 0) {
      expect(alert.action).toMatch(/would lose ₹[\d,]+ per order/)
      expect(Number(alert.numbers.lossIfMatched)).toBeGreaterThan(0)
    }
  })
})

describe('test 7 — T4, priced out of view', () => {
  const base = { previousImpressions: 1_000, categoryTrend: 1, previousCategoryTrend: 1 }

  it('fires at exactly a 20% drop', () => {
    const alert = checkT4(ctx({ ...base, impressions: 800 }))
    expect(alert).not.toBeNull()
    expect(alert!.id).toBe('T4')
    expect(Number(alert!.numbers.impressionsDrop)).toBe(20)
  })

  it('does not fire just below a 20% drop', () => {
    expect(checkT4(ctx({ ...base, impressions: 801 }))).toBeNull()
  })

  it('stays quiet when the whole category is falling too', () => {
    // Same 20% drop, but demand itself is down — the price is not the reason.
    expect(
      checkT4(ctx({ ...base, impressions: 800, categoryTrend: 0.6, previousCategoryTrend: 1 })),
    ).toBeNull()
    // Flat counts as "not falling", so it does fire.
    expect(
      checkT4(ctx({ ...base, impressions: 800, categoryTrend: 1, previousCategoryTrend: 1 })),
    ).not.toBeNull()
    // Rising counts too.
    expect(
      checkT4(ctx({ ...base, impressions: 800, categoryTrend: 1.5, previousCategoryTrend: 1 })),
    ).not.toBeNull()
  })

  it('needs a previous week to compare against', () => {
    expect(checkT4(ctx({ impressions: 10 }))).toBeNull()
    expect(checkT4(ctx({ impressions: 10, previousImpressions: 0 }))).toBeNull()
  })

  it('reports the percentile it has drifted to', () => {
    const alert = checkT4(ctx({ ...base, impressions: 500, price: 500 }))!
    expect(alert.action).toMatch(/^You have moved out of the visible band \(now at the \d+th percentile\)\.$/)
  })
})

describe('test 7 — T5, COGS shift', () => {
  it('fires just above a 5% change, in either direction', () => {
    const up = defaultFloorInput('ethnic_women', { cogs: 150 * 1.051 })
    expect(
      checkT5(ctx({ input: up, range: floorRange(up), previousCogs: 150 })),
    ).not.toBeNull()

    const down = defaultFloorInput('ethnic_women', { cogs: 150 * 0.949 })
    const alert = checkT5(ctx({ input: down, range: floorRange(down), previousCogs: 150 }))
    expect(alert).not.toBeNull()
    expect(alert!.numbers.direction).toBe('down')
  })

  it('does not fire at exactly 5%, because the rule is strict', () => {
    const exact = defaultFloorInput('ethnic_women', { cogs: 150 * 1.05 })
    expect(checkT5(ctx({ input: exact, range: floorRange(exact), previousCogs: 150 }))).toBeNull()
  })

  it('does not fire just below 5%', () => {
    const under = defaultFloorInput('ethnic_women', { cogs: 150 * 1.049 })
    expect(checkT5(ctx({ input: under, range: floorRange(under), previousCogs: 150 }))).toBeNull()
  })

  it('needs a previous cost to compare against', () => {
    expect(checkT5(ctx())).toBeNull()
  })

  it('reports the new floor', () => {
    // The journey's week-14 event: fabric up 6%.
    const risen = defaultFloorInput('ethnic_women', { cogs: 159 })
    const alert = checkT5(ctx({ input: risen, range: floorRange(risen), previousCogs: 150 }))!
    expect(alert.numbers.cogsOld).toBe(150)
    expect(alert.numbers.cogsNew).toBe(159)
    expect(Number(alert.numbers.floorNew)).toBeGreaterThan(Number(alert.numbers.floorOld))
    expect(alert.action).toMatch(/^Your cost changed; your floor is now ₹[\d,]+\.$/)
  })
})

describe('test 7 — T6, repriced without checking', () => {
  it('fires on any manual price change', () => {
    const alert = checkT6(ctx({ manualPriceChange: { from: 330, to: 300 } }))
    expect(alert).not.toBeNull()
    expect(alert!.id).toBe('T6')
  })

  it('fires on a one-rupee change, because there is no numeric threshold', () => {
    expect(checkT6(ctx({ manualPriceChange: { from: 330, to: 329 } }))).not.toBeNull()
  })

  it('does not fire when nothing changed', () => {
    expect(checkT6(ctx({ manualPriceChange: { from: 330, to: 330 } }))).toBeNull()
    expect(checkT6(ctx())).toBeNull()
  })

  it('says what the new price actually earns', () => {
    const loss = checkT6(ctx({ manualPriceChange: { from: 330, to: 300 } }))!
    expect(loss.severity).toBe('critical')
    expect(loss.action).toMatch(
      /^You changed the price to ₹300\. Your floor is ₹[\d,]+, so you now lose ₹[\d,]+ per order\.$/,
    )

    const gain = checkT6(ctx({ manualPriceChange: { from: 300, to: 400 } }))!
    expect(gain.severity).toBe('info')
    expect(gain.action).toMatch(/so you now make ₹[\d,]+ per order\.$/)
  })
})

// ---------------------------------------------------------------------------

describe('trigger plumbing', () => {
  it('evaluates all six and returns them in order', () => {
    const everything = ctx({
      price: 500,
      baselineReturnRate: 0.157,
      recentReturnRates: [0.26, 0.26],
      seasonIndexAhead: 1.867,
      impressions: 500,
      previousImpressions: 1_000,
      categoryTrend: 1,
      previousCategoryTrend: 1,
      previousCogs: 100,
      manualPriceChange: { from: 400, to: 500 },
    })
    const alerts = evaluateTriggers(everything)
    expect(alerts.map((a) => a.id)).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T6'])
  })

  it('returns nothing when the world is quiet', () => {
    expect(evaluateTriggers(ctx({ price: 330 }))).toEqual([])
  })

  it('reaches every trigger by id', () => {
    for (const id of TRIGGER_IDS) {
      expect(checkTrigger(id, ctx())).toBeNull()
    }
  })

  it('gives every alert a week, a severity, numbers and a restore point', () => {
    const alerts = evaluateTriggers(
      ctx({
        week: 16,
        price: 500,
        baselineReturnRate: 0.157,
        recentReturnRates: [0.26, 0.26],
        seasonIndexAhead: 1.867,
        impressions: 500,
        previousImpressions: 1_000,
        previousCogs: 100,
        manualPriceChange: { from: 400, to: 500 },
      }),
    )
    expect(alerts.length).toBeGreaterThan(0)
    for (const alert of alerts) {
      expect(alert.week).toBe(16)
      expect(['info', 'warn', 'critical']).toContain(alert.severity)
      expect(alert.title.length).toBeGreaterThan(0)
      expect(alert.detail).toMatch(/₹|%/)
      expect(alert.action).toMatch(/₹|percentile/)
      expect(Object.keys(alert.numbers).length).toBeGreaterThan(0)
      expect(alert.restore?.price).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// Spec section 8 — the nudge templates
// ---------------------------------------------------------------------------

describe('nudges (spec section 8)', () => {
  const festive = checkT2(ctx({ price: 300, seasonIndexAhead: 1.867 }))!

  it('matches the Hindi T2 template from the spec, verbatim', () => {
    const n = festive.numbers
    const expected =
      `रमेश जी, त्योहार के मौसम में RTO बढ़ जाता है। आपकी कुर्ती का सही न्यूनतम दाम ` +
      `₹${n.floorOld} से बढ़कर ₹${n.floorNew} हो गया है। अभी आप ₹${n.price} पर बेच रहे हैं — ` +
      `हर ऑर्डर पर ₹${n.loss} का नुकसान। दाम जाँचें →`
    expect(nudgeText(festive, 'hi')).toBe(expected)
  })

  it('keeps RTO, COD and ₹ as-is in the Hindi', () => {
    expect(nudgeFor(festive, 'hi').body).toContain('RTO')
    expect(nudgeFor(festive, 'hi').body).toContain('₹')
  })

  it('writes both languages for every trigger, with the numbers filled in', () => {
    const alerts = evaluateTriggers(
      ctx({
        price: 500,
        baselineReturnRate: 0.157,
        recentReturnRates: [0.26, 0.26],
        seasonIndexAhead: 1.867,
        impressions: 500,
        previousImpressions: 1_000,
        previousCogs: 100,
        manualPriceChange: { from: 400, to: 500 },
      }),
    )
    expect(alerts).toHaveLength(6)
    for (const alert of alerts) {
      for (const lang of ['en', 'hi'] as const) {
        const { body, cta } = nudgeFor(alert, lang)
        expect(body.length).toBeGreaterThan(40)
        expect(cta.length).toBeGreaterThan(0)
        // No placeholder left unfilled, and no stray "undefined" or "NaN".
        expect(body).not.toMatch(/\{|\}|undefined|NaN/)
        expect(body).toContain('₹')
      }
      expect(nudgeFor(alert, 'en').body).toContain('Ramesh')
      expect(nudgeFor(alert, 'hi').body).toContain('रमेश')
    }
  })

  it('names the product in the language being read', () => {
    const t1 = checkT1(ctx({ baselineReturnRate: 0.157, recentReturnRates: [0.26, 0.26] }))!
    expect(nudgeFor(t1, 'en').body).toContain('kurti')
    expect(nudgeFor(t1, 'hi').body).toContain('कुर्ती')
  })

  it('switches between the loss and the profit wording', () => {
    const losing = checkT6(ctx({ manualPriceChange: { from: 400, to: 250 } }))!
    expect(nudgeFor(losing, 'en').body).toMatch(/you now lose ₹/)
    expect(nudgeFor(losing, 'hi').body).toContain('नुकसान')

    const earning = checkT6(ctx({ manualPriceChange: { from: 250, to: 450 } }))!
    expect(nudgeFor(earning, 'en').body).toMatch(/you now make ₹/)
    expect(nudgeFor(earning, 'hi').body).toContain('बच रहे हैं')
  })

  it('accepts a different seller and product', () => {
    const text = nudgeFor(festive, 'en', { name: 'Sunita', product: 'saree' }).body
    expect(text).toContain('Sunita ji')
    expect(text).toContain('saree')
  })
})
