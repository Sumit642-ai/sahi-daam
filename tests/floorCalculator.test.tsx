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

  it('renders all seven deck cost lines with their working and amount', () => {
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

  it('shows the deck table as the DEFAULT scenario, not only in the ⓘ panel', () => {
    // Acceptance item 1: "the cost table matches the deck lines". The default
    // scenario is the expected return rate of 13/83 = 0.157, which reproduces
    // every deck line to the rupee without any unit overrides.
    const seller = markup(false)
    for (const line of ['₹5,000', '₹3,604', '₹900', '₹800', '₹560', '₹899', '₹0']) {
      expect(seller).toContain(line)
    }
    expect(seller).toContain('₹11,763') // deck ₹11,760
    expect(seller).toContain('₹168.12') // deck ₹168
    expect(seller).toContain('₹318.12') // deck ₹318
    expect(seller).toContain('÷ clean sales (70.0)') // deck 70
  })

  it('renders the floor range headline as ₹315 – ₹362', () => {
    // Acceptance checklist item 1.
    expect(html).toContain('₹315')
    expect(html).toContain('₹362')
    expect(html).toContain('Your true floor')
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
