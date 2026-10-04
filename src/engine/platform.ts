/**
 * The platform lens: what each category's orders cost Meesho, and what moving
 * an order from COD to prepaid saves it.
 *
 * Aggregated over category defaults only. No individual seller's cost is used
 * or shown — every row is the category's example product, which is itself an
 * ASSUMPTION in categories.json.
 *
 * Pure, framework-free. No React imports.
 */
import { categories, fees } from '../data'
import {
  type FloorInput,
  type RateSource,
  costToServeRange,
  defaultFloorInput,
  floorRange,
  slabFor,
} from './floor'

/** As given: 1,261 Mn orders in H1 FY26, doubled for a year. */
export const ANNUAL_ORDERS_MN = 1_261 * 2

/**
 * Meesho's saving when one order moves from COD to prepaid: the RTO it no
 * longer risks (forward + GST + reverse, times the drop in RTO probability)
 * plus the COD handling it no longer pays.
 */
export function shiftSavingPerOrder(weightG: number, rateSource: RateSource = 'dice'): number {
  const slab = slabFor(weightG, rateSource)
  const rtoCost = slab.forward * (1 + fees.gstRate) + slab.reverse
  return (fees.rtoCod - fees.rtoPrepaid) * rtoCost + fees.codFee
}

/** ₹ Cr a year, if 1% of annual orders move from COD to prepaid. */
export function savingPerOnePercentCr(perOrder: number): number {
  const orders = (ANNUAL_ORDERS_MN / 100) * 1e6
  return (orders * perOrder) / 1e7
}

export interface PlatformRow {
  categoryId: string
  name_en: string
  name_hi: string
  cogs: number
  weightG: number
  sellerFloor: number
  costToServe: number
  absorbsPerCleanSale: number
  shiftSavingPerOrder: number
}

export interface PlatformView {
  rows: PlatformRow[]
  /** Average saving per shifted order, assuming an equal mix of the categories. */
  averageShiftSaving: number
  /** ₹ Cr a year per 1% of orders shifted, on that equal mix. */
  savingPerOnePercentCr: number
  /** The same on ≤500 g parcels alone (the kurti), for comparison. */
  lightParcelSavingPerOnePercentCr: number
}

export function platformView(): PlatformView {
  const rows = categories.map((c) => {
    const input: FloorInput = defaultFloorInput(c.id)
    const seller = floorRange(input)
    const cts = costToServeRange(input)
    return {
      categoryId: c.id,
      name_en: c.name_en,
      name_hi: c.name_hi,
      cogs: input.cogs,
      weightG: input.weightG,
      sellerFloor: seller.expected,
      costToServe: cts.expected,
      absorbsPerCleanSale: seller.results.expected.absorbedPerCleanSale,
      shiftSavingPerOrder: shiftSavingPerOrder(input.weightG),
    }
  })
  const averageShiftSaving = rows.reduce((s, r) => s + r.shiftSavingPerOrder, 0) / rows.length
  return {
    rows,
    averageShiftSaving,
    savingPerOnePercentCr: savingPerOnePercentCr(averageShiftSaving),
    lightParcelSavingPerOnePercentCr: savingPerOnePercentCr(shiftSavingPerOrder(350)),
  }
}
