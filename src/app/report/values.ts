/** Reading cell values from Excel and CSV reports. Pure, no React. */

/**
 * A money or count cell as a number: 239.27, "-59.0", "₹1,200.50",
 * "(59.00)" (accounting negative), "INR 300". Blank or junk → undefined.
 */
export function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (v === null || v === undefined) return undefined
  let s = String(v).trim()
  if (s === '' || s === '-') return undefined
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  s = s.replace(/₹|inr|rs\.?|,|\s/gi, '')
  if (!/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return undefined
  const n = Number(s)
  return negative ? -n : n
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Excel's day 0 is 1899-12-30 (it counts 1900 as a leap year). */
function fromExcelSerial(serial: number): string {
  const ms = Math.round((serial - 25569) * 86_400_000)
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/**
 * A date cell as "yyyy-mm-dd": a Date, an Excel serial, "2026-09-28",
 * "2026-09-28 14:03:00", or Indian day-first "28-09-2026" / "28/09/2026".
 */
export function toIsoDate(v: unknown): string | undefined {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`
  }
  if (typeof v === 'number' && v > 20_000 && v < 80_000) return fromExcelSerial(v)
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(s)
  if (m) return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`
  return undefined
}

/** Days from `from` to `to`, counting both ends. */
export function daysInclusive(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000) + 1
}

export function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return toIsoDate(v) ?? ''
  return String(v).trim()
}
