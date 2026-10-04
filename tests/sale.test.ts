import { describe, expect, it } from 'vitest'

import { defaultFloorInput, floorRange } from '../src/engine/floor'
import { PREPAID_SHIFT, saleCheck } from '../src/engine/sale'

/** Ramesh's kurti, his 70 orders a week. */
const KURTI = defaultFloorInput('ethnic_women', { cogs: 150, weightG: 350 })
const WEEK = 70

describe('sale check — "Should I join this sale?"', () => {
  it('says Skip when the sale price is under the floor: the default kurti at 20% off', () => {
    const check = saleCheck({ price: 300, discount: 0.2, orderLift: 0.3, weeklyOrders: WEEK, input: KURTI })
    expect(check.salePrice).toBe(240)
    expect(check.verdict).toBe('SKIP_LOSS')
    expect(Math.round(check.lossPerSaleOrder)).toBe(31) // ₹270.64 − ₹240
    expect(check.headline).toBe('Skip — every sale order loses ₹31.')
    expect(check.weekJoining).toBeLessThan(0)
    expect(check.weekNotJoining).toBeGreaterThan(0)
  })

  it('says Join when the sale clears the floor and the extra orders pay for the discount', () => {
    const check = saleCheck({ price: 400, discount: 0.1, orderLift: 1, weeklyOrders: WEEK, input: KURTI })
    expect(check.salePrice).toBe(360)
    expect(check.verdict).toBe('JOIN')
    expect(check.weekJoining).toBeGreaterThan(check.weekNotJoining)
    expect(check.headline).toMatch(/^Join — /)
  })

  it('says Join only if you push prepaid when the prepaid fix brings the floor under the sale price', () => {
    // Under the supplier policy the prepaid fix moves the seller floor by well
    // under a rupee, so find a product cost whose window holds a whole rupee.
    let found: { cogs: number; salePrice: number } | null = null
    for (let cogs = 120; cogs <= 200 && !found; cogs += 1) {
      const input = { ...KURTI, cogs }
      const floor = floorRange(input).expected
      const prepaid = floorRange({ ...input, codShare: input.codShare - PREPAID_SHIFT }).expected
      const n = Math.ceil(prepaid)
      if (n < floor) found = { cogs, salePrice: n }
    }
    expect(found).not.toBeNull()

    const input = { ...KURTI, cogs: found!.cogs }
    const check = saleCheck({
      price: found!.salePrice / 0.8,
      discount: 0.2,
      orderLift: 0.3,
      weeklyOrders: WEEK,
      input,
    })
    expect(check.salePrice).toBe(found!.salePrice)
    expect(check.salePrice).toBeLessThan(check.floor)
    expect(check.salePrice).toBeGreaterThanOrEqual(check.prepaidFloor)
    expect(check.verdict).toBe('JOIN_IF_PREPAID')
    expect(check.headline).toMatch(/^Join only if you push prepaid/)
  })

  it('says Skip, not Join, when the sale clears the floor but earns less than not joining', () => {
    // 20% off a ₹400 kurti still clears the floor, but +30% orders does not
    // make up for a thinner margin.
    const check = saleCheck({ price: 400, discount: 0.2, orderLift: 0.3, weeklyOrders: WEEK, input: KURTI })
    expect(check.salePrice).toBeGreaterThanOrEqual(check.floor)
    expect(check.verdict).toBe('SKIP_LESS')
    expect(check.weekJoining).toBeLessThan(check.weekNotJoining)
  })
})
