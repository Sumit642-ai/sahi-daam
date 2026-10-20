import { describe, expect, it } from 'vitest'

import type { Product, Shop } from '../../src/app/db'
import {
  WEEKS_PER_MONTH,
  filterRows,
  keepInputFor,
  leakFinder,
  statusChanges,
  summarise,
} from '../../src/app/lib/products'
import { newShop } from '../../src/app/repo'
import { sourceOf } from '../../src/engine/keep'

const shop: Shop = newShop('en', 0)

let seq = 0
const product = (patch: Partial<Product> = {}): Product => ({
  id: `p${++seq}`,
  name: 'Blue kurti',
  category: 'ethnic_women',
  cost: 150,
  weightG: 350,
  price: 300,
  createdAt: 0,
  updatedAt: 0,
  ...patch,
})

describe('a hand-added product through engine v2', () => {
  it('the default kurti keeps ₹29.77 a sale with a ₹268.74 floor (ENGINE.md)', () => {
    const s = summarise(product(), shop)
    expect(s.result.keep).toBeCloseTo(29.7694, 4)
    expect(s.result.floor).toBeCloseTo(268.7421, 4)
    expect(s.status).toBe('HEALTHY')
    expect(s.estimated).toBe(true)
  })

  it('panel charges are entered with GST and used before GST', () => {
    const input = keepInputFor(product({ ship: 59, returnShip: 141.6 }), shop)
    expect(input.fwdPerDelivered).toBeCloseTo(50, 10)
    expect(input.revPerReturn).toBeCloseTo(120, 10)
    expect(sourceOf(input, 'fwdPerDelivered')).toBe('YOU_ENTERED')
    expect(summarise(product({ ship: 59, returnShip: 141.6 }), shop).result.keep).toBeCloseTo(29.7694, 4)
  })

  it('without a panel charge the estimate is tagged ESTIMATED', () => {
    const input = keepInputFor(product(), shop)
    expect(sourceOf(input, 'fwdPerDelivered')).toBe('ESTIMATED')
    expect(sourceOf(input, 'price')).toBe('YOU_ENTERED')
    expect(sourceOf(input, 'cost')).toBe('YOU_ENTERED')
  })

  it('follows the shop setup: not registered, small towns', () => {
    const input = keepInputFor(product(), { ...shop, gstRegistered: false, buyerRegion: 'small_towns' })
    expect(input.gstRegistered).toBe(false)
    expect(input.rtoRate).toBeCloseTo(0.21, 10)
  })

  it('statuses: below floor = Loss, under 10% over = Thin, else Healthy', () => {
    expect(summarise(product({ price: 260 }), shop).status).toBe('LOSS')
    expect(summarise(product({ price: 285 }), shop).status).toBe('THIN') // floor 268.74, margin 5.7%
    expect(summarise(product({ price: 300 }), shop).status).toBe('HEALTHY') // margin 10.4%
    expect(summarise(product({ cost: 400, price: 300 }), shop).status).toBe('LOSS')
  })

  it('monthly = orders a week × 52/12 × clean-sale share × keep', () => {
    const s = summarise(product({ ordersPerWeek: 40 }), shop)
    const clean = 40 * WEEKS_PER_MONTH * (1 - 0.17) * (1 - 0.157)
    expect(s.monthly).toBeCloseTo(clean * s.result.keep, 6)
    expect(summarise(product(), shop).monthly).toBeNull()
  })
})

describe('profit leak finder (spec 7.5)', () => {
  const healthy = product({ name: 'Healthy', price: 400, ordersPerWeek: 10 })
  const thin = product({ name: 'Thin', price: 285, ordersPerWeek: 10 })
  const smallLoss = product({ name: 'Small loss', price: 260, ordersPerWeek: 5 })
  const bigLoss = product({ name: 'Big loss', price: 240, ordersPerWeek: 50 })
  const lossNoCount = product({ name: 'Loss, no count', price: 200 })

  it('ranks worst first: losses by money lost a month, then thin, then healthy', () => {
    const lf = leakFinder([healthy, thin, lossNoCount, smallLoss, bigLoss], shop)
    expect(lf.rows.map((r) => r.product.name)).toEqual(['Big loss', 'Small loss', 'Loss, no count', 'Thin', 'Healthy'])
  })

  it('totals the monthly loss of products with an order count', () => {
    const lf = leakFinder([healthy, thin, lossNoCount, smallLoss, bigLoss], shop)
    const big = summarise(bigLoss, shop).monthly!
    const small = summarise(smallLoss, shop).monthly!
    expect(lf.losingCount).toBe(2)
    expect(lf.monthlyLoss).toBeCloseTo(-(big + small), 6)
    expect(lf.hasOrderCounts).toBe(true)
  })

  it('hides the top card when no product has an order count', () => {
    const lf = leakFinder([product({ price: 200 }), product()], shop)
    expect(lf.hasOrderCounts).toBe(false)
    expect(lf.losingCount).toBe(0)
  })

  it('filters All / Losing / Thin, and searches by name', () => {
    const rows = leakFinder([healthy, thin, smallLoss, bigLoss], shop).rows
    expect(filterRows(rows, 'LOSS', '').map((r) => r.product.name)).toEqual(['Big loss', 'Small loss'])
    expect(filterRows(rows, 'THIN', '').map((r) => r.product.name)).toEqual(['Thin'])
    expect(filterRows(rows, 'ALL', 'loss')).toHaveLength(2)
    expect(filterRows(rows, 'ALL', '  HEALTHY ')).toHaveLength(1)
  })
})

describe('shop setup edit → products recompute (spec 8.2)', () => {
  it('counts the products whose status changes', () => {
    // A ₹270 kurti is Thin when registered (floor ₹268.74) and a Loss when not (₹270.64).
    const products = [product({ price: 270 }), product({ price: 500 })]
    expect(statusChanges(products, shop, { ...shop, gstRegistered: false })).toBe(1)
    expect(statusChanges(products, shop, shop)).toBe(0)
  })
})
