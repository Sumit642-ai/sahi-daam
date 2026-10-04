import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { bandFor } from '../src/engine/band'
import {
  defaultFloorInput,
  sellerFloor as floor,
  floorRange,
  marginPct,
  profitPer100Dispatched,
  slabFor,
} from '../src/engine/floor'
import { inr, num, pct, signedInr, units } from '../src/engine/format'
import { recommend, verdictFor } from '../src/engine/recommend'
import { ExpandAllContext } from '../src/components/ShowWorking'
import { AuthProvider } from '../src/auth'
import { I18nProvider } from '../src/i18n'
import { Alerts } from '../src/pages/Alerts'
import { Assumptions } from '../src/pages/Assumptions'
import { FloorCalculator } from '../src/pages/FloorCalculator'
import { Home } from '../src/pages/Home'
import { MarketBand } from '../src/pages/MarketBand'
import { MeeshoComparison } from '../src/pages/MeeshoComparison'
import {
  ProductInputsProvider,
  type ProductInputs,
} from '../src/state/productInputs'

/**
 * Phase 7 — empty and edge inputs.
 *
 * A seller will clear a field, type a minus sign, paste a weight in kilograms,
 * or drag a slider to its end. None of that should produce "NaN", "Infinity" or
 * a blank screen. These tests push every screen to those corners.
 */

function render(initial: Partial<ProductInputs>, screen: ReactNode, judge = false) {
  return renderToStaticMarkup(
    <I18nProvider>
      <AuthProvider>
      <ProductInputsProvider initial={initial}>
        <ExpandAllContext.Provider value={judge}>{screen}</ExpandAllContext.Provider>
      </ProductInputsProvider>
      </AuthProvider>
    </I18nProvider>,
  )
}

/** The visible text, with every tag and attribute stripped out. */
function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ')
}

/** The strings that mean something went wrong on screen. */
function expectNoBrokenNumbers(html: string) {
  // NaN and Infinity are bugs wherever they appear, including inside a style
  // or a slider's max attribute, where they silently break the control.
  expect(html).not.toMatch(/NaN/)
  expect(html).not.toMatch(/Infinity/)

  // These only matter in what the seller actually reads. A float with fifteen
  // decimal places is fine in a CSS width and ugly in a price.
  const text = visibleText(html)
  expect(text).not.toMatch(/undefined/)
  expect(text).not.toMatch(/\[object Object\]/)
  expect(text).not.toMatch(/\d\.\d{4,}/)
  // An unfilled i18n placeholder, e.g. a stray {rate}.
  expect(text).not.toMatch(/\{[a-zA-Z]+\}/)
}

/** The corners a seller can actually reach through the UI. */
const CORNERS: { name: string; inputs: Partial<ProductInputs> }[] = [
  { name: 'everything cleared', inputs: { cogs: null, weightG: null, packagingCost: null, adSpendPerOrder: null, plannedPrice: null } },
  { name: 'zero cost and zero weight', inputs: { cogs: 0, weightG: 0, packagingCost: 0, adSpendPerOrder: 0 } },
  { name: 'price of zero', inputs: { plannedPrice: 0 } },
  { name: 'price below cost', inputs: { cogs: 500, plannedPrice: 50 } },
  { name: 'a 20 kg parcel', inputs: { weightG: 20_000 } },
  { name: 'a one-gram parcel', inputs: { weightG: 1 } },
  { name: 'every order returned', inputs: { returnRateLow: 1, returnRateExpected: 1, returnRateHigh: 1 } },
  { name: 'nothing returned', inputs: { returnRateLow: 0, returnRateExpected: 0, returnRateHigh: 0 } },
  { name: 'all COD, all refused', inputs: { codShare: 1, rtoCod: 1, rtoPrepaid: 1 } },
  { name: 'all prepaid, nothing refused', inputs: { codShare: 0, rtoCod: 0, rtoPrepaid: 0 } },
  { name: 'enormous ad spend', inputs: { adSpendPerOrder: 100_000 } },
  { name: 'enormous cost', inputs: { cogs: 1_000_000, plannedPrice: 999_999 } },
  { name: 'a not-viable beauty product', inputs: { categoryId: 'beauty', cogs: 120 } },
]

describe('every screen survives every corner', () => {
  const screens = [
    ['Aapki Laagat', <FloorCalculator key="f" />],
    ['Bazaar Ka Daam', <MarketBand key="b" />],
    ['Daam Badlo', <Alerts key="a" onOpenBand={() => {}} />],
    ['Meesho vs Sahi Daam', <MeeshoComparison key="c" onOpenBand={() => {}} />],
    ['Home', <Home key="h" onOpenFloor={() => {}} onOpenJourney={() => {}} onOpenCompare={() => {}} />],
    ['Numbers & sources', <Assumptions key="s" />],
  ] as const

  for (const [screenName, element] of screens) {
    for (const corner of CORNERS) {
      it(`${screenName}: ${corner.name}`, () => {
        const html = render(corner.inputs, element)
        expect(html.length).toBeGreaterThan(500)
        expectNoBrokenNumbers(html)
      })
    }
  }

  it('survives the corners with every formula panel open too', () => {
    for (const corner of CORNERS) {
      const html = render(corner.inputs, <FloorCalculator />, true)
      expectNoBrokenNumbers(html)
    }
  })
})

describe('the engine at the corners', () => {
  it('reports an unreachable floor rather than a number, when nothing survives', () => {
    const dead = floor({ ...defaultFloorInput('ethnic_women'), returnRate: 1, rtoCod: 0, rtoPrepaid: 0 })
    expect(dead.viable).toBe(false)
    expect(dead.floor).toBe(Number.POSITIVE_INFINITY)
    // ...and the formatters turn that into an em dash, not "Infinity".
    expect(inr(dead.floor)).toBe('—')
    expect(num(dead.floor)).toBe('—')
    expect(pct(dead.floor)).toBe('—')
    expect(units(dead.floor)).toBe('—')
    expect(signedInr(dead.floor)).toBe('—')
  })

  it('handles a price of zero without dividing by it', () => {
    const range = floorRange(defaultFloorInput('ethnic_women'))
    expect(marginPct(0, range.expected)).toBe(Number.NEGATIVE_INFINITY)
    expect(pct(marginPct(0, range.expected))).toBe('—')
    const v = verdictFor({
      price: 0,
      input: defaultFloorInput('ethnic_women'),
      range,
      band: bandFor('ethnic_women'),
    })
    expect(v.verdict).toBe('LOSS')
    expect(v.detail).not.toMatch(/NaN|Infinity/)
  })

  it('keeps extrapolating shipping slabs for a very heavy parcel', () => {
    const heavy = slabFor(20_000)
    expect(Number.isFinite(heavy.forward)).toBe(true)
    expect(Number.isFinite(heavy.reverse)).toBe(true)
    expect(heavy.forward).toBeGreaterThan(slabFor(2_000).forward)
    expect(heavy.label).toMatch(/g$/)
    // Monotonic all the way up.
    let last = 0
    for (let g = 100; g <= 30_000; g += 500) {
      expect(slabFor(g).forward).toBeGreaterThanOrEqual(last)
      last = slabFor(g).forward
    }
  })

  it('treats a zero or negative cost as zero rather than a negative floor', () => {
    const free = floor({ ...defaultFloorInput('ethnic_women'), cogs: 0 })
    expect(free.floor).toBeGreaterThan(0) // the overhead still has to be covered
    expect(Number.isFinite(free.floor)).toBe(true)
  })

  it('still recommends above the floor at the corners', () => {
    const band = bandFor('ethnic_women')
    for (const patch of [
      { cogs: 0 },
      { cogs: 1_000_000 },
      { weightG: 20_000 },
      { returnRate: 0 },
      { adSpendPerOrder: 100_000 },
      { codShare: 1, rtoCod: 1 },
    ]) {
      const input = { ...defaultFloorInput('ethnic_women'), ...patch }
      const range = floorRange(input)
      if (!Number.isFinite(range.expected)) continue
      for (const stage of ['LAUNCH', 'RAMP', 'MATURE', 'DECLINE'] as const) {
        const rec = recommend(stage, range, band, { currentPrice: 1 })
        expect(rec.price).toBeGreaterThanOrEqual(range.expected)
        expect(Number.isFinite(rec.price)).toBe(true)
      }
    }
  })

  it('keeps profit arithmetic finite when the floor is not', () => {
    const dead = floor({ ...defaultFloorInput('ethnic_women'), returnRate: 1, rtoCod: 0, rtoPrepaid: 0 })
    expect(profitPer100Dispatched(300, dead)).not.toBeNaN()
    expect(signedInr(profitPer100Dispatched(300, dead))).toMatch(/—|₹/)
  })
})
