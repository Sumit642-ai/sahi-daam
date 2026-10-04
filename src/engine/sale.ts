/**
 * Sale check: "Should I join this sale?"
 *
 * A platform sale asks the seller to list at a discount in exchange for more
 * orders. Whether that is worth it is two questions, answered on the SELLER
 * floor (what the seller actually pays):
 *
 *   1. Does the sale price still clear the floor? If not, every sale order
 *      loses money, however many there are.
 *   2. If it does, does the extra volume make up for the thinner margin over
 *      the sale week, against simply not joining?
 *
 * Between those sits one more case: the sale price is under the floor today,
 * but the prepaid fix (COD share down 20 points) would bring the floor under
 * it. Then joining is only right together with pushing prepaid.
 *
 * Pure, framework-free. No React imports.
 */
import {
  type FloorInput,
  type FloorRange,
  type ReturnRateTriple,
  floorRange,
  keepPerCleanSale,
} from './floor'
import { inr } from './format'

export type SaleVerdict = 'JOIN' | 'JOIN_IF_PREPAID' | 'SKIP_LOSS' | 'SKIP_LESS'

export interface SaleCheckArgs {
  /** What the seller lists at today. */
  price: number
  /** Sale discount, 0..1. */
  discount: number
  /** Expected extra orders during the sale week, 0..1 (ASSUMPTION). */
  orderLift: number
  /** Orders dispatched in a normal week. */
  weeklyOrders: number
  input: FloorInput
  returnRates?: ReturnRateTriple
}

export interface SaleCheck {
  verdict: SaleVerdict
  /** The discount asked for, 0..1. */
  discount: number
  /** The verdict line the seller reads. */
  headline: string
  salePrice: number
  floor: number
  /** Floor with the prepaid fix applied (COD share − 20 points). */
  prepaidFloor: number
  prepaidCodShare: number
  /** What one clean sale keeps, at today's price and at the sale price. */
  perSaleNow: number
  perSaleAtSale: number
  /** Clean sales per order dispatched, at the expected return rate. */
  survival: number
  weeklyOrders: number
  saleWeekOrders: number
  /** Profit over one week: not joining, and joining. */
  weekNotJoining: number
  weekJoining: number
  /** Joining with the prepaid fix in place (same orders, prepaid floor). */
  weekJoiningPrepaid: number
  /** Loss on every sale order when the sale price is under the floor. */
  lossPerSaleOrder: number
  range: FloorRange
}

/** The prepaid fix the NOT_VIABLE card offers: COD share down 20 points. */
export const PREPAID_SHIFT = 0.2

export function saleCheck(args: SaleCheckArgs): SaleCheck {
  const { price, discount, orderLift, weeklyOrders, input, returnRates } = args
  const range = floorRange(input, returnRates)
  const result = range.results.expected
  const floor = range.expected

  // Listings are in whole rupees.
  const salePrice = Math.round(price * (1 - discount))

  const prepaidCodShare = Math.max(0, input.codShare - PREPAID_SHIFT)
  const prepaid = floorRange({ ...input, codShare: prepaidCodShare }, returnRates)
  const prepaidFloor = prepaid.expected

  const survival = result.survivalRate
  const perSaleNow = keepPerCleanSale(price, result)
  const perSaleAtSale = keepPerCleanSale(salePrice, result)
  const saleWeekOrders = weeklyOrders * (1 + orderLift)

  const weekNotJoining = weeklyOrders * survival * perSaleNow
  const weekJoining = saleWeekOrders * survival * perSaleAtSale
  const weekJoiningPrepaid =
    saleWeekOrders * prepaid.results.expected.survivalRate *
    keepPerCleanSale(salePrice, prepaid.results.expected)

  const lossPerSaleOrder = Math.max(0, floor - salePrice)

  let verdict: SaleVerdict
  let headline: string
  if (salePrice >= floor) {
    if (weekJoining >= weekNotJoining) {
      verdict = 'JOIN'
      headline =
        `Join — at ${inr(salePrice)} you still clear ${inr(perSaleAtSale)} a sale, and the extra ` +
        `orders earn ${inr(weekJoining - weekNotJoining)} more over the week.`
    } else {
      verdict = 'SKIP_LESS'
      headline =
        `Skip — ${inr(salePrice)} clears your floor, but the sale week earns ` +
        `${inr(weekNotJoining - weekJoining)} less than not joining.`
    }
  } else if (salePrice >= prepaidFloor) {
    verdict = 'JOIN_IF_PREPAID'
    headline =
      `Join only if you push prepaid — at ${inr(salePrice)} you are under your floor of ` +
      `${inr(floor, 2)}, but moving COD from ${Math.round(input.codShare * 100)}% to ` +
      `${Math.round(prepaidCodShare * 100)}% brings it to ${inr(prepaidFloor, 2)}.`
  } else {
    verdict = 'SKIP_LOSS'
    headline = `Skip — every sale order loses ${inr(lossPerSaleOrder)}.`
  }

  return {
    verdict,
    discount,
    headline,
    salePrice,
    floor,
    prepaidFloor,
    prepaidCodShare,
    perSaleNow,
    perSaleAtSale,
    survival,
    weeklyOrders,
    saleWeekOrders,
    weekNotJoining,
    weekJoining,
    weekJoiningPrepaid,
    lossPerSaleOrder,
    range,
  }
}
