import { describe, expect, it } from 'vitest'

import {
  type ProductDraft,
  draftFromProduct,
  emptyDraft,
  parseAmount,
  validateProduct,
} from '../../src/app/lib/validate'

const valid = (patch: Partial<ProductDraft> = {}): ProductDraft => ({
  ...emptyDraft('ethnic_women'),
  name: 'Blue kurti',
  cost: '150',
  weightG: '350',
  price: '300',
  ...patch,
})

const today = new Date('2026-10-20T12:00:00')

describe('parseAmount — numbers the way sellers type them', () => {
  it.each([
    ['300', 300],
    [' 1,200 ', 1200],
    ['₹349', 349],
    ['Rs. 99', 99],
    ['12.5', 12.5],
    ['३००', 300],
    ['१,२५०', 1250],
  ])('%s → %s', (raw, n) => expect(parseAmount(raw)).toBe(n))

  it('empty is null, junk is NaN', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('   ')).toBeNull()
    expect(parseAmount('abc')).toBeNaN()
    expect(parseAmount('12a')).toBeNaN()
  })
})

describe('the 4 required fields (spec 7.4, 8.3)', () => {
  it('accepts the default kurti', () => {
    const v = validateProduct(valid(), today)
    expect(v.valid).toBe(true)
    expect(v.errors).toEqual({})
    expect(v.value).toMatchObject({ name: 'Blue kurti', cost: 150, weightG: 350, price: 300, category: 'ethnic_women' })
  })

  it('an empty form is invalid on every required field', () => {
    const v = validateProduct(emptyDraft('ethnic_women'), today)
    expect(v.valid).toBe(false)
    expect(v.value).toBeNull()
    expect(v.errors).toEqual({
      name: 'error.nameRequired',
      cost: 'error.required',
      weightG: 'error.required',
      price: 'error.required',
    })
  })

  it('a blank-space name is not a name', () => {
    expect(validateProduct(valid({ name: '   ' }), today).errors.name).toBe('error.nameRequired')
    expect(validateProduct(valid({ name: 'x'.repeat(81) }), today).errors.name).toBe('error.nameTooLong')
  })

  it.each(['0', '-5', '0.00'])('cost %s → "must be more than 0", save blocked', (cost) => {
    const v = validateProduct(valid({ cost }), today)
    expect(v.errors.cost).toBe('error.mustBePositive')
    expect(v.valid).toBe(false)
  })

  it.each(['0', '-300'])('price %s → "must be more than 0"', (price) => {
    expect(validateProduct(valid({ price }), today).errors.price).toBe('error.mustBePositive')
  })

  it('letters in a number field → "enter a number"', () => {
    expect(validateProduct(valid({ cost: 'one fifty' }), today).errors.cost).toBe('error.notANumber')
  })

  it.each([
    ['49', false],
    ['50', true],
    ['10000', true],
    ['10001', false],
  ])('weight %s g valid: %s (50–10,000 g)', (weightG, ok) => {
    const v = validateProduct(valid({ weightG }), today)
    expect(v.valid).toBe(ok)
    if (!ok) expect(v.errors.weightG).toBe('error.weightRange')
  })

  it('cost ≥ price still saves, with a warning', () => {
    for (const [cost, price] of [
      ['300', '300'],
      ['320', '300'],
    ]) {
      const v = validateProduct(valid({ cost, price }), today)
      expect(v.valid).toBe(true)
      expect(v.costAtLeastPrice).toBe(true)
    }
    expect(validateProduct(valid(), today).costAtLeastPrice).toBe(false)
  })
})

describe('optional fields', () => {
  it('blank optional fields are left out', () => {
    const v = validateProduct(valid(), today)
    expect(v.value!.ship).toBeUndefined()
    expect(v.value!.ordersPerWeek).toBeUndefined()
    expect(v.value!.listedSince).toBeUndefined()
  })

  it('parses every optional field', () => {
    const v = validateProduct(
      valid({ ship: '₹65', returnShip: '155', packaging: '10', adPerOrder: '4', ordersPerWeek: '40', stock: '500', listedSince: '2026-08-01' }),
      today,
    )
    expect(v.valid).toBe(true)
    expect(v.value).toMatchObject({ ship: 65, returnShip: 155, packaging: 10, adPerOrder: 4, ordersPerWeek: 40, stock: 500, listedSince: '2026-08-01' })
  })

  it('rejects negatives, fractional stock, bad and future dates', () => {
    expect(validateProduct(valid({ ship: '-1' }), today).errors.ship).toBe('error.mustBeZeroOrMore')
    expect(validateProduct(valid({ stock: '2.5' }), today).errors.stock).toBe('error.wholeNumber')
    expect(validateProduct(valid({ listedSince: '2026-13-40' }), today).errors.listedSince).toBe('error.badDate')
    expect(validateProduct(valid({ listedSince: '2026-12-01' }), today).errors.listedSince).toBe('error.futureDate')
  })

  it('ads of ₹0 is a real answer, not blank', () => {
    expect(validateProduct(valid({ adPerOrder: '0' }), today).value!.adPerOrder).toBe(0)
  })
})

describe('editing', () => {
  it('a saved product round-trips through the form', () => {
    const v = validateProduct(valid({ ship: '65', stock: '12' }), today)
    const again = validateProduct(draftFromProduct(v.value!), today)
    expect(again.value).toEqual(v.value)
  })
})
