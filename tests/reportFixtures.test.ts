/**
 * Every report fixture loads and its totals match expected_totals.json.
 *
 * Fixtures in tests/fixtures/reports/synthetic/ are SAMPLE / SYNTHETIC (see
 * its README). Real redacted reports go in tests/fixtures/reports/real/ with
 * their own expected totals once gate G2 is met.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { summariseOrders } from '../src/engine/report'
import { SYNTHETIC_DIR, loadOrderRows, loadWorkbook } from './fixtures/reports/loadReport'

interface ExpectedSku {
  dispatched: number
  delivered_kept: number
  customer_returns: number
  rto: number
  cancelled: number
  rto_pct: number
  return_pct_of_delivered: number
  net_settlement: number
}
interface ExpectedWeek {
  rows: number
  skus: Record<string, ExpectedSku>
  ads_total: number
  compensation: number
}

const expected: Record<string, ExpectedWeek> = JSON.parse(
  readFileSync(join(SYNTHETIC_DIR, 'expected_totals.json'), 'utf8'),
)

const reportFiles = readdirSync(SYNTHETIC_DIR).filter(
  (f) => /PAYMENT_FILE_week\d/.test(f) && (f.endsWith('.xlsx') || f.endsWith('.csv')),
)

const sumColumn = (rows: Record<string, unknown>[], col: string) =>
  rows.reduce((s, r) => s + Number(r[col] ?? 0), 0)

const round2 = (n: number) => Math.round(n * 100) / 100

describe('synthetic report fixtures', () => {
  it('has both weeks as .xlsx and as .csv', () => {
    expect(reportFiles.sort()).toEqual([
      'SAMPLE_SYNTHETIC_PAYMENT_FILE_week1.xlsx',
      'SAMPLE_SYNTHETIC_PAYMENT_FILE_week1_order_payments.csv',
      'SAMPLE_SYNTHETIC_PAYMENT_FILE_week2.xlsx',
      'SAMPLE_SYNTHETIC_PAYMENT_FILE_week2_order_payments.csv',
    ])
  })

  describe.each(reportFiles)('%s', (file) => {
    const week = file.match(/week(\d)/)![0]
    const want = expected[week]!
    const { rows, sheets } = loadOrderRows(join(SYNTHETIC_DIR, file))
    const stats = summariseOrders(rows)

    it(`has ${want.rows} order rows and the same ${Object.keys(want.skus).length} products`, () => {
      expect(rows).toHaveLength(want.rows)
      expect([...stats.keys()].sort()).toEqual(Object.keys(want.skus).sort())
    })

    it.each(Object.keys(want.skus))('%s matches expected_totals.json', (sku) => {
      const s = stats.get(sku)!
      const e = want.skus[sku]!
      expect(s.dispatched).toBe(e.dispatched)
      expect(s.deliveredKept).toBe(e.delivered_kept)
      expect(s.returns).toBe(e.customer_returns)
      expect(s.rto).toBe(e.rto)
      expect(s.cancelled).toBe(e.cancelled)
      expect(round2(s.rtoRate * 100)).toBe(e.rto_pct)
      expect(round2(s.returnRate * 100)).toBe(e.return_pct_of_delivered)
      expect(s.netSettlement).toBeCloseTo(e.net_settlement, 2)
    })

    if (file.endsWith('.xlsx')) {
      it('Ads Cost and Compensation sheets match', () => {
        expect(sumColumn(sheets['Ads Cost']!, 'Total Ads Cost')).toBeCloseTo(want.ads_total, 2)
        expect(
          sumColumn(sheets['Compensation and Recovery']!, 'Amount (inc GST) INR'),
        ).toBeCloseTo(want.compensation, 2)
      })

      it('is labelled synthetic', () => {
        const disclaimer = JSON.stringify(sheets['Disclaimer'])
        expect(disclaimer).toMatch(/SYNTHETIC/)
      })
    }

    it('never carries buyer names into the parsed rows', () => {
      expect(JSON.stringify(rows)).not.toMatch(/TEST BUYER/)
    })
  })

  it('the .csv and .xlsx of each week give identical per-product totals', () => {
    for (const week of ['week1', 'week2']) {
      const x = summariseOrders(
        loadOrderRows(join(SYNTHETIC_DIR, `SAMPLE_SYNTHETIC_PAYMENT_FILE_${week}.xlsx`)).rows,
      )
      const c = summariseOrders(
        loadOrderRows(join(SYNTHETIC_DIR, `SAMPLE_SYNTHETIC_PAYMENT_FILE_${week}_order_payments.csv`)).rows,
      )
      for (const [sku, s] of x) {
        const t = c.get(sku)!
        expect(t.dispatched).toBe(s.dispatched)
        expect(t.netSettlement).toBeCloseTo(s.netSettlement, 6)
        expect(t.tcsTds).toBeCloseTo(s.tcsTds, 6)
      }
    }
  })

  it('sku_costs_SAMPLE.csv covers every product in the reports', () => {
    const costs = Object.values(loadWorkbook(join(SYNTHETIC_DIR, 'sku_costs_SAMPLE.csv')))[0]!
    expect(costs.map((r) => String(r['Supplier SKU'])).sort()).toEqual(
      Object.keys(expected.week1!.skus).sort(),
    )
    const kurti = costs.find((r) => r['Supplier SKU'] === 'KURTI-BLUE-01')!
    expect(Number(kurti['Cost Price'])).toBe(150)
    expect(Number(kurti['Packed Weight (g)'])).toBe(350)
  })
})
