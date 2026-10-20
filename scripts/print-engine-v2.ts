/**
 * Prints engine v2's default kurti (registered and not) and the reconciliation
 * of every product in the synthetic fixtures. Run: npm run verify:engine
 */
import { join } from 'node:path'

import {
  DEFAULT_SHOP,
  defaultKeepInput,
  keepIfReturnsRise,
  keepPerSale,
} from '../src/engine/keep'
import { reconcile, summariseOrders } from '../src/engine/report'
import { saleLiftCheck } from '../src/engine/saleLift'
import { SYNTHETIC_DIR, loadOrderRows, loadWorkbook } from '../tests/fixtures/reports/loadReport'

const rs = (n: number) => `₹${n.toFixed(2)}`

console.log('Default kurti: ₹150 cost, ₹300 price, 350 g, women\'s ethnic, mixed buyers\n')
for (const gstRegistered of [true, false]) {
  const input = defaultKeepInput(
    'ethnic_women',
    { cost: 150, price: 300, weightG: 350 },
    { ...DEFAULT_SHOP, gstRegistered },
  )
  const r = keepPerSale(input)
  const up = keepIfReturnsRise(input)
  let breakEvenReturns = input.returnRate
  while (keepPerSale({ ...input, returnRate: breakEvenReturns }).keep > 0) breakEvenReturns += 0.0001
  const sale = saleLiftCheck({ input })
  console.log(gstRegistered ? 'GST-registered (default)' : 'Not GST-registered')
  console.log(`  keep per sale  ${rs(r.keep)}   (you think: ${rs(r.naiveMargin)})`)
  console.log(`  floor          ${rs(r.floor)}`)
  console.log(`  returns +5 pts keep ${rs(up.keep)}, floor ${rs(up.floor)}`)
  console.log(`  keep hits ₹0 at returns of ${(breakEvenReturns * 100).toFixed(1)}%`)
  console.log(`  20% sale       ${sale.verdict} at ₹${sale.salePrice}, loses ${rs(sale.lossPerSaleOrder)} a sale order\n`)
}

console.log('Reconciliation against the synthetic fixtures (default inputs per SKU)\n')
const costs = Object.values(loadWorkbook(join(SYNTHETIC_DIR, 'sku_costs_SAMPLE.csv')))[0]!
const categoryOf: Record<string, string> = {
  'KURTI-BLUE-01': 'ethnic_women',
  'DUPATTA-COT-02': 'ethnic_women',
  'SAREE-PRT-03': 'ethnic_women',
  'JHUMKA-04': 'jewellery',
  'KURTISET-05': 'ethnic_women',
}
for (const week of ['week1', 'week2']) {
  const { rows } = loadOrderRows(join(SYNTHETIC_DIR, `SAMPLE_SYNTHETIC_PAYMENT_FILE_${week}.xlsx`))
  for (const [sku, stats] of summariseOrders(rows)) {
    const c = costs.find((x) => x['Supplier SKU'] === sku)!
    const input = defaultKeepInput(categoryOf[sku]!, {
      cost: Number(c['Cost Price']),
      price: stats.avgPrice ?? 0,
      weightG: Number(c['Packed Weight (g)']),
    })
    const rec = reconcile(input, stats)
    const gap = rec.gapLines[0] ? `  biggest gap: ${rec.gapLines[0].field}` : ''
    console.log(
      `  ${week} ${sku.padEnd(15)} model ${rs(rec.model).padStart(8)}  report ${rs(rec.report).padStart(8)}  ` +
        `${(rec.differencePct * 100).toFixed(1).padStart(5)}%  ${rec.status}${gap}`,
    )
  }
}
