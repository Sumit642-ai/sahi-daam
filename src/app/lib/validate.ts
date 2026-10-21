/**
 * Add-product validation (MVP spec v2, 7.4 and 8.3). Pure, no React.
 *
 * Required: name, product cost, weight, current price.
 *   - cost and price must be more than 0
 *   - weight 50–10,000 g
 *   - cost ≥ price still saves, with a red warning (the floor card shows the loss)
 * Optional fields must be numbers ≥ 0 when filled in; "listed since" can't be
 * in the future.
 */
import type { ProductInput } from '../repo'

export interface ProductDraft {
  name: string
  cost: string
  weightG: string
  price: string
  category: string
  sku: string
  ship: string
  returnShip: string
  packaging: string
  adPerOrder: string
  ordersPerWeek: string
  stock: string
  listedSince: string
}

export type DraftField = keyof ProductDraft

/**
 * "When did you list it?" (optional, next to the required fields). Each
 * answer is saved as a "listed since" date at the start of its band, so the
 * stage moves on by itself as time passes. Blank means Steady (lib/stage).
 */
export type ListedAge = 'NOW' | 'MONTHS_1_3' | 'MONTHS_3_PLUS'
export const LISTED_AGES: readonly ListedAge[] = ['NOW', 'MONTHS_1_3', 'MONTHS_3_PLUS'] as const
const LISTED_AGE_DAYS: Record<ListedAge, number> = { NOW: 0, MONTHS_1_3: 30, MONTHS_3_PLUS: 90 }

/** The "listed since" date (yyyy-mm-dd, local) an answer stands for. */
export function listedSinceFor(age: ListedAge, today: Date = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - LISTED_AGE_DAYS[age])
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** i18n keys under "error.*". */
export type ErrorKey =
  | 'error.nameRequired'
  | 'error.nameTooLong'
  | 'error.required'
  | 'error.notANumber'
  | 'error.mustBePositive'
  | 'error.mustBeZeroOrMore'
  | 'error.weightRange'
  | 'error.wholeNumber'
  | 'error.futureDate'
  | 'error.badDate'

export interface Validation {
  valid: boolean
  errors: Partial<Record<DraftField, ErrorKey>>
  /** Saves, but shows a red warning. */
  costAtLeastPrice: boolean
  /** The parsed product, when valid. */
  value: ProductInput | null
}

export const WEIGHT_MIN_G = 50
export const WEIGHT_MAX_G = 10_000
export const NAME_MAX = 80

export function emptyDraft(category: string): ProductDraft {
  return {
    name: '',
    cost: '',
    weightG: '',
    price: '',
    category,
    sku: '',
    ship: '',
    returnShip: '',
    packaging: '',
    adPerOrder: '',
    ordersPerWeek: '',
    stock: '',
    listedSince: '',
  }
}

const DEVANAGARI_DIGITS = '०१२३४५६७८९'

/**
 * Reads a number the way a seller types it: "₹1,200", " 300 ", or with
 * Devanagari digits from a Hindi keyboard ("३००"). Empty → null; junk → NaN.
 */
export function parseAmount(raw: string): number | null {
  const ascii = raw.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)))
  const cleaned = ascii.replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '')
  if (cleaned === '') return null
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return Number.NaN
  return Number(cleaned)
}

export function validateProduct(draft: ProductDraft, today: Date = new Date()): Validation {
  const errors: Partial<Record<DraftField, ErrorKey>> = {}

  const name = draft.name.trim()
  if (name === '') errors.name = 'error.nameRequired'
  else if (name.length > NAME_MAX) errors.name = 'error.nameTooLong'

  const positive = (field: 'cost' | 'price'): number | null => {
    const n = parseAmount(draft[field])
    if (n === null) errors[field] = 'error.required'
    else if (Number.isNaN(n)) errors[field] = 'error.notANumber'
    else if (n <= 0) errors[field] = 'error.mustBePositive'
    else return n
    return null
  }
  const cost = positive('cost')
  const price = positive('price')

  let weightG: number | null = null
  const w = parseAmount(draft.weightG)
  if (w === null) errors.weightG = 'error.required'
  else if (Number.isNaN(w)) errors.weightG = 'error.notANumber'
  else if (w < WEIGHT_MIN_G || w > WEIGHT_MAX_G) errors.weightG = 'error.weightRange'
  else weightG = w

  const optional = (field: DraftField, whole = false): number | undefined => {
    const n = parseAmount(draft[field])
    if (n === null) return undefined
    if (Number.isNaN(n)) errors[field] = 'error.notANumber'
    else if (n < 0) errors[field] = 'error.mustBeZeroOrMore'
    else if (whole && !Number.isInteger(n)) errors[field] = 'error.wholeNumber'
    else return n
    return undefined
  }
  const ship = optional('ship')
  const returnShip = optional('returnShip')
  const packaging = optional('packaging')
  const adPerOrder = optional('adPerOrder')
  const ordersPerWeek = optional('ordersPerWeek')
  const stock = optional('stock', true)

  let listedSince: string | undefined
  if (draft.listedSince.trim() !== '') {
    const d = draft.listedSince.trim()
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00`) : null
    if (!parsed || Number.isNaN(parsed.getTime())) errors.listedSince = 'error.badDate'
    else if (parsed.getTime() > today.getTime()) errors.listedSince = 'error.futureDate'
    else listedSince = d
  }

  const sku = draft.sku.trim() === '' ? undefined : draft.sku.trim()
  if (sku && sku.length > 60) errors.sku = 'error.nameTooLong'

  const valid = Object.keys(errors).length === 0
  return {
    valid,
    errors,
    costAtLeastPrice: cost !== null && price !== null && cost >= price,
    value:
      valid && cost !== null && price !== null && weightG !== null
        ? {
            name,
            category: draft.category,
            sku,
            cost,
            price,
            weightG,
            ship,
            returnShip,
            packaging,
            adPerOrder,
            ordersPerWeek,
            stock,
            listedSince,
          }
        : null,
  }
}

/** A saved product back into form strings, for editing. */
export function draftFromProduct(p: ProductInput): ProductDraft {
  const s = (v: number | undefined) => (v === undefined ? '' : String(v))
  return {
    name: p.name,
    cost: String(p.cost),
    weightG: String(p.weightG),
    price: String(p.price),
    category: p.category,
    sku: p.sku ?? '',
    ship: s(p.ship),
    returnShip: s(p.returnShip),
    packaging: s(p.packaging),
    adPerOrder: s(p.adPerOrder),
    ordersPerWeek: s(p.ordersPerWeek),
    stock: s(p.stock),
    listedSince: p.listedSince ?? '',
  }
}
