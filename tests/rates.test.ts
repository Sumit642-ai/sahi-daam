import { describe, expect, it } from 'vitest'

import { categories, fees, weightSlabExtraStep, weightSlabs } from '../src/data'
import { categoryRates, rateEntries, rates } from '../src/data/rates'
import policyJson from '../src/data/policy.json'

describe('rates.json (spec v2, 6.4)', () => {
  const entries = rateEntries()

  it('lists every rate', () => {
    // 9 global + 4 RTO prior + 3 regions + 4 slabs × 2 + 2 extra step + 9 categories (8 + Other) × 5
    expect(entries).toHaveLength(9 + 4 + 3 + 8 + 2 + 45)
  })

  it.each(entries.map((e) => [e.path, e.entry] as const))(
    '%s has a source, a lastVerified date and a status',
    (_path, entry) => {
      expect(entry.source.trim().length).toBeGreaterThan(5)
      expect(entry.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(Date.parse(entry.lastVerified))).toBe(false)
      expect(['CITED', 'ASSUMPTION', 'FROM_REPORT']).toContain(entry.status)
    },
  )

  it('never marks an "Our estimate" source as CITED', () => {
    for (const { path, entry } of entries) {
      if (/our estimate/i.test(entry.source)) expect(entry.status, path).not.toBe('CITED')
    }
  })

  it('agrees with the prototype data the story pages use', () => {
    expect(rates.unitsBasis).toBe(fees.unitsBasis)
    expect(rates.feeGstRate).toBe(fees.gstRate)
    expect(rates.rtoPrior.codShare).toBe(fees.codShare)
    expect(rates.rtoPrior.rtoCod).toBe(fees.rtoCod)
    expect(rates.rtoPrior.rtoPrepaid).toBe(fees.rtoPrepaid)
    expect(rates.categories.ethnic_women!.outputGstRate).toBe(policyJson.outputGst.value)

    expect(rates.shipping.slabs.map((s) => [s.maxG, s.forward, s.reverse])).toEqual(
      weightSlabs.map((s) => [s.maxG, s.forward, s.reverse]),
    )
    expect(rates.shipping.extraStep).toEqual({
      stepG: weightSlabExtraStep.stepG,
      forward: weightSlabExtraStep.forward,
      reverse: weightSlabExtraStep.reverse,
    })

    // "Other" is the seller app's own; the story pages keep their eight.
    expect(Object.keys(rates.categories).sort()).toEqual([...categories.map((c) => c.id), 'other'].sort())
    for (const c of categories) {
      const r = categoryRates(c.id)
      expect(r.weightG, c.id).toBe(c.defaultWeightG)
      expect(r.packagingPerOrder, c.id).toBe(c.packagingCost)
      expect(r.returnRate, c.id).toBe(c.returnRateExpected)
      expect(r.unsellableShare, c.id).toBe(c.writeOffShare)
    }
  })

  it('"Other": rough numbers, each marked please check', () => {
    expect(categoryRates('other')).toEqual({ weightG: 500, packagingPerOrder: 10, returnRate: 0.1, unsellableShare: 0.4, outputGstRate: 0.18 })
    const other = entries.filter((e) => e.path.startsWith('categories.other.'))
    expect(other).toHaveLength(5)
    for (const { entry } of other) expect(entry.label_en).toMatch(/please check/)
  })

  it('throws on an unknown category', () => {
    expect(() => categoryRates('nope')).toThrow(/Unknown category/)
  })
})
