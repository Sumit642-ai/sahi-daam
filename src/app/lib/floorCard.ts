/**
 * The floor card's "Why" table and "What to do" actions (spec v2, 7.6).
 * Pure, no React. Only costs the seller pays: no Meesho-cost lines (hard rule 4).
 */
import { categoryRates } from '../../data/rates'
import {
  type InputSource,
  type KeepField,
  type KeepInput,
  type KeepResult,
  keepPerSale,
  sourceOf,
  withPrepaidPush,
} from '../../engine/keep'

export type WhyKey = 'cost' | 'forward' | 'reverse' | 'feeGst' | 'packaging' | 'ads' | 'writeOff' | 'penalties' | 'other' | 'outputGst'

export interface WhyLine {
  key: WhyKey
  /** ₹ per clean sale. */
  perSale: number
  /** ₹ on 100 dispatched (0 for cost and output GST, which are per sale). */
  per100: number
  /** The numbers behind per100, for "Show working". */
  parts: number[]
  source: InputSource
}

export interface WhyTable {
  lines: WhyLine[]
  /** Cost + every cost line per clean sale: what each sale must net. */
  netFloor: number
  floor: number
  cleanSales: number
}

const src = (input: KeepInput, f: KeepField) => sourceOf(input, f)

export function whyTable(input: KeepInput, r: KeepResult): WhyTable {
  const C = r.C
  const per = (x: number) => (C > 0 ? x / C : Number.POSITIVE_INFINITY)
  const forwardUnits = input.fwdOnRto ? r.N : r.D
  const lines: WhyLine[] = [
    { key: 'cost', perSale: input.cost, per100: 0, parts: [input.cost], source: src(input, 'cost') },
    {
      key: 'forward',
      perSale: per(r.lines.forward),
      per100: r.lines.forward,
      parts: [forwardUnits, input.fwdPerDelivered],
      source: src(input, 'fwdPerDelivered'),
    },
    {
      key: 'reverse',
      perSale: per(r.lines.reverse),
      per100: r.lines.reverse,
      parts: [r.Q, input.revPerReturn],
      source: src(input, 'revPerReturn'),
    },
    {
      key: 'feeGst',
      perSale: per(r.lines.feeGstCost),
      per100: r.lines.feeGstCost,
      parts: [r.lines.feeGst],
      source: 'ESTIMATED',
    },
    {
      key: 'packaging',
      perSale: per(r.lines.packaging),
      per100: r.lines.packaging,
      parts: [r.N, input.packagingPerOrder],
      source: src(input, 'packagingPerOrder'),
    },
    { key: 'ads', perSale: per(r.lines.ads), per100: r.lines.ads, parts: [r.N, input.adPerOrder], source: src(input, 'adPerOrder') },
    {
      key: 'writeOff',
      perSale: per(r.lines.writeOff),
      per100: r.lines.writeOff,
      parts: [r.Q, input.unsellableShare, input.cost],
      source: src(input, 'unsellableShare'),
    },
  ]
  if (r.lines.penalties !== 0) {
    lines.push({
      key: 'penalties',
      perSale: per(r.lines.penalties),
      per100: r.lines.penalties,
      parts: [r.N, input.penaltiesPerOrder],
      source: src(input, 'penaltiesPerOrder'),
    })
  }
  // Shown once it is worth a paisa a sale either way.
  if (Number.isFinite(per(r.lines.other)) && Math.abs(per(r.lines.other)) >= 0.005) {
    lines.push({
      key: 'other',
      perSale: per(r.lines.other),
      per100: r.lines.other,
      parts: [r.D, input.otherPerDelivered ?? 0],
      source: 'FROM_REPORT',
    })
  }
  if (r.outputGstRate > 0) {
    lines.push({
      key: 'outputGst',
      perSale: r.floor - r.netFloor,
      per100: 0,
      parts: [r.outputGstRate, r.netFloor],
      source: src(input, 'outputGstRate'),
    })
  }
  return { lines, netFloor: r.netFloor, floor: r.floor, cleanSales: C }
}

export type ActionId = 'prepaid' | 'listing' | 'price'

export interface Action {
  id: ActionId
  /** Keep per sale after the action, ₹. */
  newKeep: number
  /** newKeep − keep now, ₹ per sale. */
  effect: number
  /** The price for the "price" action. */
  price?: number
}

/** An action worth less than this per sale isn't worth a seller's time to list. */
export const MIN_EFFECT = 1

/** Returns are "above the category norm" when they beat it by this much or more. */
export const RETURNS_STEP = 0.05

/**
 * Up to three actions, in the spec's order, each with its rupee effect:
 *   1. push prepaid (when COD-heavy: no prepaid discount in shop setup)
 *   2. fix the listing (when returns are above the category norm): returns −5 points
 *   3. change price to the price helper's recommendation
 */
export function whatToDo(args: {
  input: KeepInput
  categoryId: string
  codHeavy: boolean
  recommendedPrice: number | null
}): Action[] {
  const { input, categoryId, codHeavy, recommendedPrice } = args
  const keep = keepPerSale(input).keep
  const out: Action[] = []

  if (codHeavy) {
    const newKeep = keepPerSale(withPrepaidPush(input)).keep
    if (newKeep - keep >= MIN_EFFECT) out.push({ id: 'prepaid', newKeep, effect: newKeep - keep })
  }

  if (input.returnRate > categoryRates(categoryId).returnRate) {
    const newKeep = keepPerSale({ ...input, returnRate: Math.max(0, input.returnRate - RETURNS_STEP) }).keep
    if (newKeep - keep >= MIN_EFFECT) out.push({ id: 'listing', newKeep, effect: newKeep - keep })
  }

  if (recommendedPrice !== null && Number.isFinite(recommendedPrice) && Math.round(recommendedPrice) !== Math.round(input.price)) {
    const newKeep = keepPerSale({ ...input, price: recommendedPrice }).keep
    if (newKeep - keep >= MIN_EFFECT) out.push({ id: 'price', newKeep, effect: newKeep - keep, price: recommendedPrice })
  }
  return out.slice(0, 3)
}
