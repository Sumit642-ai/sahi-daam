import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ExpandAllContext } from '../src/components/ShowWorking'
import { FloorCalculator } from '../src/pages/FloorCalculator'
import { AuthProvider } from '../src/auth'
import { I18nProvider } from '../src/i18n'
import { ProductInputsProvider } from '../src/state/productInputs'

/**
 * Screen 1 render checks (spec section 9.2 and acceptance checklist items 1–3).
 *
 * The point of these is the acceptance line "This must reproduce the deck table
 * for the default kurti" — so they assert the actual rendered markup, not the
 * engine, which tests 1–4 already cover.
 */

/** The screen as a seller first sees it, with every working panel expanded. */
const markup = (expandAll = true) =>
  renderToStaticMarkup(
    <I18nProvider>
      <AuthProvider>
      <ProductInputsProvider>
        <ExpandAllContext.Provider value={expandAll}>
          <FloorCalculator />
        </ExpandAllContext.Provider>
      </ProductInputsProvider>
      </AuthProvider>
    </I18nProvider>,
  )

describe('Screen 1 — default kurti reproduces the deck cost table', () => {
  const html = markup()

  it('keeps the deck’s full cost-to-serve table in the working panel', () => {
    const deckRows: [string, string, string][] = [
      ['Forward shipping', '100 × ₹50', '₹5,000'],
      ['Reverse shipping (RTO + returns)', '(17 + 13) × ₹120', '₹3,600'],
      ['GST on forward shipping', '18% × ₹5,000', '₹900'],
      ['Packaging', '100 × ₹8', '₹800'],
      ['COD handling', '100 × 80% × ₹7', '₹560'],
      ['Unsellable returns (product written off)', '6 × ₹150', '₹900'],
      ['Ad spend', '100 × ₹0', '₹0'],
    ]
    for (const [label, working, amount] of deckRows) {
      expect(html).toContain(label)
      expect(html).toContain(working)
      expect(html).toContain(amount)
    }
  })

  it('renders the deck total, the division and the ₹318 floor', () => {
    expect(html).toContain('₹11,760')
    expect(html).toContain('₹11,760 ÷ 70 + ₹150')
    expect(html).toContain('₹318')
  })

  it('shows the SELLER table by default: the lines the seller pays, and who pays each', () => {
    const seller = markup(false)
    const rows: [string, string, string][] = [
      ['Forward shipping (delivered orders)', '83 × ₹50', '₹4,150'],
      ['Reverse shipping (customer returns)', '13.0 × ₹120', '₹1,564'],
      ['GST on your shipping fees', '18% × (₹4,150 + ₹1,564)', '₹1,028'],
      ['Packaging', '100 × ₹8', '₹800'],
      ['Unsellable returns (product written off)', '6.0 × ₹150', '₹899'],
    ]
    for (const [label, working, amount] of rows) {
      expect(seller).toContain(label)
      expect(seller).toContain(working)
      expect(seller).toContain(amount)
    }
    expect(seller).toContain('Who pays')
    expect(seller).toContain('₹8,441') // total the seller pays
    expect(seller).toContain('₹120.64') // ÷ 70 clean sales
    expect(seller).toContain('₹270.64') // + ₹150 COGS
    expect(seller).toContain('÷ clean sales (70.0)')
  })

  it('lists what Meesho pays below the floor, out of the seller total', () => {
    const seller = markup(false)
    expect(seller).toContain('Paid by Meesho, not in your floor')
    for (const [label, amount] of [
      ['Forward shipping on RTO orders', '₹850'],
      ['Return shipping on RTO orders', '₹2,040'],
      ['COD handling', '₹560'],
    ]) {
      expect(seller).toContain(label)
      expect(seller).toContain(amount)
    }
    expect(seller).toContain('₹51.49') // Meesho absorbs per clean sale
  })

  it('heads the screen with the seller floor, cost-to-serve and what Meesho absorbs', () => {
    expect(html).toContain('Your floor (what you pay)')
    expect(html).toContain('₹268')
    expect(html).toContain('₹312')
    expect(html).toContain('Full cost-to-serve ₹318')
    expect(html).toContain('Meesho absorbs ₹51 per clean sale (RTO + COD)')
  })

  it('puts the who-pays policy settings under Advanced', () => {
    // The drawer starts closed; the settings live in it.
    expect(html).toContain('Advanced — edit Meesho')
  })

  it('tags every input with who provides it', () => {
    // Spec section 9: full input/output transparency is a mentor requirement.
    expect(html).toContain('You enter')
    expect(html).toContain('Meesho fills')
  })

  it('offers the Advanced drawer for the auto-filled values', () => {
    expect(html).toContain('Advanced — edit Meesho')
  })

  it('renders the funnel, the overhead bars and the what-if sliders', () => {
    expect(html).toContain('100 dispatched → clean sales')
    expect(html).toContain('Overhead per clean sale')
    expect(html).toContain('What if')
    expect(html).toContain('type="range"')
  })

  it('labels the three return-rate scenarios with their floors', () => {
    expect(html).toContain('Most likely')
    expect(html).toContain('15% returns')
    expect(html).toContain('16% returns')
    expect(html).toContain('25% returns')
  })

  it('keeps every working panel collapsed in seller mode', () => {
    const collapsed = markup(false)
    expect(collapsed).toContain('aria-expanded="false"')
    expect(collapsed).not.toContain('is worked out')
    // ...and opens them all when the page switch is on.
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('is worked out')
  })

  it('opens on the baseline month, so the deck numbers are not season-lifted', () => {
    // Acceptance item 3 reads "switching month to November moves the floor",
    // which only holds if the screen does not already open on a festive month.
    expect(html).toContain('March — RTO ×1.00 (baseline)')
    expect(html).toContain('17.0%') // the un-seasoned blended RTO
  })
})

describe('Screen 1 — the disputed "forward fee on RTOs" setting', () => {
  const html = renderToStaticMarkup(
    <I18nProvider>
      <AuthProvider>
        <ProductInputsProvider initial={{ forwardOnRto: true }}>
          <ExpandAllContext.Provider value={false}>
            <FloorCalculator />
          </ExpandAllContext.Provider>
        </ProductInputsProvider>
      </AuthProvider>
    </I18nProvider>,
  )

  it('charges forward shipping on all 100 dispatched and lifts the floor to about ₹285', () => {
    expect(html).toContain('Forward shipping (every dispatched order)')
    expect(html).toContain('100 × ₹50')
    expect(html).toContain('₹284.98')
    // Meesho no longer absorbs the RTO forward fee.
    expect(html).not.toContain('Forward shipping on RTO orders')
  })
})
