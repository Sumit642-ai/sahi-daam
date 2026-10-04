import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AuthProvider } from '../src/auth'
import { ExpandAllContext } from '../src/components/ShowWorking'
import { platformView, savingPerOnePercentCr, shiftSavingPerOrder } from '../src/engine/platform'
import { I18nProvider } from '../src/i18n'
import { MeeshoView } from '../src/pages/MeeshoView'
import { ProductInputsProvider } from '../src/state/productInputs'

describe('Meesho view — the platform lens', () => {
  const view = platformView()

  it('covers all 8 categories with seller floor below cost-to-serve', () => {
    expect(view.rows).toHaveLength(8)
    for (const row of view.rows) {
      expect(row.sellerFloor).toBeLessThan(row.costToServe)
      expect(row.absorbsPerCleanSale).toBeGreaterThan(0)
      expect(row.shiftSavingPerOrder).toBeGreaterThan(0)
    }
  })

  it('saves ₹33.85 per ≤500 g order moved from COD to prepaid', () => {
    // (20% − 5%) × (₹50 × 1.18 + ₹120) + ₹7
    expect(shiftSavingPerOrder(350)).toBeCloseTo(33.85, 6)
    expect(savingPerOnePercentCr(33.85)).toBeCloseTo(85.37, 2)
  })

  it('renders the table, the total line and the privacy note', () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <AuthProvider>
          <ProductInputsProvider>
            <ExpandAllContext.Provider value={false}>
              <MeeshoView />
            </ExpandAllContext.Provider>
          </ProductInputsProvider>
        </AuthProvider>
      </I18nProvider>,
    )
    expect(html).toContain('Meesho view')
    expect(html).toContain('Aggregated and anonymised — no individual seller’s cost is shown.')
    expect(html).toContain(`₹${view.savingPerOnePercentCr.toFixed(1)} Cr`)
    expect(html).toContain('Assumption')
    expect(html).not.toMatch(/NaN|Infinity/)
  })
})
