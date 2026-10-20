/**
 * Sale check v2: the break-even lift (MVP spec v2, 7.7).
 *
 * A sale cuts what each order keeps, so it only pays if enough extra orders
 * come in. The break-even lift says how many:
 *
 *   lift = keep ÷ keepAtSale − 1
 *
 * At ₹30 a sale normally and ₹20 at the sale price, orders must rise by more
 * than 50% just to stand still. Clean sales scale with orders, so the ratio
 * of the two keeps is the whole answer.
 *
 * Verdicts, checked in this order:
 *   FIX_PRICE_FIRST    the product already loses money at its normal price
 *   JOIN               lift ≤ 30%, or below the seller's own guess
 *   JOIN_WITH_PREPAID  only true once a prepaid push lowers RTO
 *   SKIP_LOSS          every sale order loses money (keepAtSale ≤ 0)
 *   SKIP_LIFT          each sale still earns, but the lift needed is too big
 *
 * Pure, framework-free. No React imports.
 */
import { type KeepInput, type KeepResult, keepPerSale, withPrepaidPush } from './keep'

export type SaleLiftVerdict =
  | 'FIX_PRICE_FIRST'
  | 'JOIN'
  | 'JOIN_WITH_PREPAID'
  | 'SKIP_LOSS'
  | 'SKIP_LIFT'

/** Join when the lift needed is at most this (spec 7.7). */
export const JOIN_LIFT_THRESHOLD = 0.3

export const DEFAULT_SALE_DISCOUNT = 0.2

export interface SaleLiftArgs {
  input: KeepInput
  /** Discount, 0..1. Default 20%. */
  discount?: number
  /** The seller's own guess of extra orders, 0..1 (optional). */
  sellerGuessLift?: number
}

export interface SaleLiftSide {
  now: KeepResult
  atSale: KeepResult
  /** keep ÷ keepAtSale − 1, or null when either keep is ≤ 0. */
  lift: number | null
}

export interface SaleLiftResult {
  verdict: SaleLiftVerdict
  discount: number
  /** Whole rupees, like a listing. */
  salePrice: number
  plain: SaleLiftSide
  withPrepaid: SaleLiftSide
  /** What each sale order loses at the sale price, ₹ (0 when it does not lose). */
  lossPerSaleOrder: number
}

/** keep ÷ keepAtSale − 1. Null when there is no positive lift to compute. */
export function breakEvenLift(keep: number, keepAtSale: number): number | null {
  if (!(keep > 0) || !(keepAtSale > 0)) return null
  return keep / keepAtSale - 1
}

function side(input: KeepInput, salePrice: number): SaleLiftSide {
  const now = keepPerSale(input)
  const atSale = keepPerSale({ ...input, price: salePrice })
  return { now, atSale, lift: breakEvenLift(now.keep, atSale.keep) }
}

export function saleLiftCheck(args: SaleLiftArgs): SaleLiftResult {
  const discount = args.discount ?? DEFAULT_SALE_DISCOUNT
  const salePrice = Math.round(args.input.price * (1 - discount))

  const plain = side(args.input, salePrice)
  const withPrepaid = side(withPrepaidPush(args.input), salePrice)

  const worthIt = (lift: number | null) =>
    lift !== null &&
    (lift <= JOIN_LIFT_THRESHOLD ||
      (args.sellerGuessLift !== undefined && lift < args.sellerGuessLift))

  let verdict: SaleLiftVerdict
  if (plain.now.keep <= 0) verdict = 'FIX_PRICE_FIRST'
  else if (worthIt(plain.lift)) verdict = 'JOIN'
  else if (worthIt(withPrepaid.lift)) verdict = 'JOIN_WITH_PREPAID'
  else if (plain.atSale.keep <= 0) verdict = 'SKIP_LOSS'
  else verdict = 'SKIP_LIFT'

  return {
    verdict,
    discount,
    salePrice,
    plain,
    withPrepaid,
    lossPerSaleOrder: Math.max(0, -plain.atSale.keep),
  }
}
