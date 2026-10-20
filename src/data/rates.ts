/**
 * Typed access to rates.json (MVP spec v2, section 6.4).
 *
 * Like index.ts, this exposes both shapes:
 *
 *   - `rates`          ... plain numbers for the v2 engine
 *   - `rateEntries()`  ... a flat list of every rate with its source, date and
 *                          status, for the "Numbers & sources" page
 *
 * No React here.
 */
import ratesJson from './rates.json'

export type RateStatus = 'CITED' | 'ASSUMPTION' | 'FROM_REPORT'

export interface RateEntry<T = number> {
  value: T
  unit: string
  label_en: string
  source: string
  /** ISO date the value was last checked against its source. */
  lastVerified: string
  status: RateStatus
}

export type BuyerRegion = 'big_cities' | 'mixed' | 'small_towns'

export interface CategoryRates {
  weightG: number
  packagingPerOrder: number
  returnRate: number
  unsellableShare: number
  outputGstRate: number
}

export interface ShippingSlab {
  maxG: number
  forward: number
  reverse: number
}

export interface Rates {
  unitsBasis: number
  feeGstRate: number
  tcsRate: number
  tdsRate: number
  gstRegisteredDefault: boolean
  fwdOnRtoDefault: boolean
  outputGstChoices: number[]
  adPerOrder: number
  penaltiesPerOrder: number
  rtoPrior: {
    codShare: number
    rtoCod: number
    rtoPrepaid: number
    prepaidDiscountCodShift: number
    regionCodRtoMultiplier: Record<BuyerRegion, number>
  }
  shipping: {
    slabs: ShippingSlab[]
    extraStep: { stepG: number; forward: number; reverse: number }
  }
  categories: Record<string, CategoryRates>
}

const g = ratesJson.global
const rp = ratesJson.rtoPrior
const sh = ratesJson.shipping

function unwrapCategory(c: Record<string, RateEntry>): CategoryRates {
  return {
    weightG: c.weightG!.value,
    packagingPerOrder: c.packagingPerOrder!.value,
    returnRate: c.returnRate!.value,
    unsellableShare: c.unsellableShare!.value,
    outputGstRate: c.outputGstRate!.value,
  }
}

export const rates: Rates = {
  unitsBasis: g.unitsBasis.value,
  feeGstRate: g.feeGstRate.value,
  tcsRate: g.tcsRate.value,
  tdsRate: g.tdsRate.value,
  gstRegisteredDefault: g.gstRegisteredDefault.value,
  fwdOnRtoDefault: g.fwdOnRtoDefault.value,
  outputGstChoices: g.outputGstChoices.value,
  adPerOrder: g.adPerOrder.value,
  penaltiesPerOrder: g.penaltiesPerOrder.value,
  rtoPrior: {
    codShare: rp.codShare.value,
    rtoCod: rp.rtoCod.value,
    rtoPrepaid: rp.rtoPrepaid.value,
    prepaidDiscountCodShift: rp.prepaidDiscountCodShift.value,
    regionCodRtoMultiplier: {
      big_cities: rp.regionCodRtoMultiplier.big_cities.value,
      mixed: rp.regionCodRtoMultiplier.mixed.value,
      small_towns: rp.regionCodRtoMultiplier.small_towns.value,
    },
  },
  shipping: {
    slabs: sh.slabs.map((s) => ({ maxG: s.maxG, forward: s.forward.value, reverse: s.reverse.value })),
    extraStep: {
      stepG: sh.extraStep.stepG,
      forward: sh.extraStep.forward.value,
      reverse: sh.extraStep.reverse.value,
    },
  },
  categories: Object.fromEntries(
    Object.entries(ratesJson.categories).map(([id, c]) => [
      id,
      unwrapCategory(c as Record<string, RateEntry>),
    ]),
  ),
}

/** Category rates, failing loudly on an unknown id rather than returning undefined. */
export function categoryRates(categoryId: string): CategoryRates {
  const c = rates.categories[categoryId]
  if (!c) throw new Error(`Unknown category in rates.json: ${categoryId}`)
  return c
}

/** Every rate as `{ path, entry }`, e.g. path "categories.kids.returnRate". */
export function rateEntries(): { path: string; entry: RateEntry<unknown> }[] {
  const out: { path: string; entry: RateEntry<unknown> }[] = []
  const walk = (node: unknown, path: string) => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`))
      return
    }
    const obj = node as Record<string, unknown>
    if ('status' in obj && 'value' in obj) {
      out.push({ path, entry: obj as unknown as RateEntry<unknown> })
      return
    }
    for (const [key, child] of Object.entries(obj)) {
      if (key.startsWith('_') || key === 'statuses') continue
      walk(child, path ? `${path}.${key}` : key)
    }
  }
  walk(ratesJson, '')
  return out
}
