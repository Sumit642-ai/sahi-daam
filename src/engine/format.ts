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
 * A floor: whole rupees rounded up, so ₹268.40 shows as ₹269 and never as a
 * ₹268 that loses money. With decimals it shows the exact amount.
 */
export function floorInr(amount: number, decimals = 0): string {
  return decimals > 0 ? inr(amount, decimals) : inr(Math.ceil(amount))
}

/**
 * A date through `fmt`, or an em dash when it isn't a real date (Intl throws
 * a RangeError on those). Takes a timestamp, a Date, or "yyyy-mm-dd" (read as local).
 */
export function formatDate(fmt: Intl.DateTimeFormat, value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const d =
    value instanceof Date
      ? value
      : typeof value === 'number'
        ? new Date(value)
        : new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value)
  return Number.isNaN(d.getTime()) ? '—' : fmt.format(d)
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
