import { describe, expect, it } from 'vitest'

import en from '../../src/i18n/en.json'
import hi from '../../src/i18n/hi.json'
import { translate } from '../../src/i18n'

describe('MVP dictionaries (spec v2, section 15 test 9)', () => {
  it('hi.json has every key in en.json, and nothing extra', () => {
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort())
  })

  it('no value is empty', () => {
    for (const [k, v] of [...Object.entries(en), ...Object.entries(hi)]) expect(v.trim(), k).not.toBe('')
  })

  it('every Hindi string is actually Hindi (no English left in)', () => {
    for (const [k, v] of Object.entries(hi)) expect(v, k).toMatch(/[ऀ-ॿ]/)
  })

  it('placeholders match between languages', () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort()
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(vars(hi[k]), k).toEqual(vars(en[k]))
    }
  })

  it('fills placeholders', () => {
    expect(translate('en', 'home.leakTitle', { count: 3, amount: '₹4,200' })).toBe(
      '3 products are costing you about ₹4,200 a month',
    )
    expect(translate('hi', 'onb.step', { n: 2 })).toBe('चरण 2 / 3')
  })
})
