/**
 * ₹ formatting helpers (spec section 4). Pure, no React.
 *
 * Indian digit grouping throughout: ₹1,23,456, not ₹123,456.
 */

const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const inrPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const plain = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

/** ₹1,23,456 — rupees, no paise. Non-finite input renders as an em dash. */
export function inr(amount: number, decimals = 0): string {
  if (!Number.isFinite(amount)) return '—'
  return decimals > 0 ? inrPaise.format(amount) : inrWhole.format(amount)
}

/**
 * Cache by decimal count. Building an Intl.NumberFormat is expensive, and the
 * engine formats a `working` string for every cost line of every floor it
 * computes — thousands of calls in the guardrail test alone.
 */
const decimalFormatters = new Map<number, Intl.NumberFormat>()

function decimalFormatter(decimals: number): Intl.NumberFormat {
  let found = decimalFormatters.get(decimals)
  if (!found) {
    found = new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    decimalFormatters.set(decimals, found)
  }
  return found
}

/** 1,23,456 — Indian grouping without the currency symbol. */
export function num(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '—'
  return decimalFormatter(decimals).format(value)
}

/** Unit counts: whole numbers stay whole, fractions keep one decimal (16.6). */
export function units(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return Number.isInteger(value) ? plain.format(value) : num(value, 1)
}

/** 17.0% — a share (0..1) rendered as a percentage. */
export function pct(share: number, decimals = 1): string {
  if (!Number.isFinite(share)) return '—'
  return `${num(share * 100, decimals)}%`
}

/** -₹18 with the sign always shown, for profit-or-loss figures. */
export function signedInr(amount: number, decimals = 0): string {
  if (!Number.isFinite(amount)) return '—'
  const sign = amount < 0 ? '-' : '+'
  return `${sign}${inr(Math.abs(amount), decimals)}`
}
