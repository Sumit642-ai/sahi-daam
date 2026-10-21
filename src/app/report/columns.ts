/**
 * Finding the right columns in a Meesho report (spec v2, 7.3). Pure, no React.
 *
 * Never relies on exact names: every header is normalised (case, punctuation,
 * spacing) and scored against keyword patterns, so "Supplier SKU", "SKU ID"
 * and "sku_code" all land on the SKU field. Each header is used at most once,
 * best score first. Anything required that can't be found goes to the
 * mapping screen; nothing fails silently.
 *
 * Personal columns (buyer name, phone, address, email, PIN code) are found by
 * header alone and dropped before any value is read (spec section 9).
 */

export type ReportField =
  | 'sku'
  | 'status'
  | 'settlement'
  | 'productName'
  | 'subOrderNo'
  | 'quantity'
  | 'listingPrice'
  | 'shipping'
  | 'returnShipping'
  | 'tcs'
  | 'tds'
  | 'orderDate'
  | 'paymentMode'

/** Without these there is nothing to total. */
export const REQUIRED_FIELDS: ReportField[] = ['sku', 'status', 'settlement']

/** Display order on the mapping screen: required first. */
export const ALL_FIELDS: ReportField[] = [
  'sku',
  'status',
  'settlement',
  'productName',
  'subOrderNo',
  'quantity',
  'listingPrice',
  'shipping',
  'returnShipping',
  'tcs',
  'tds',
  'orderDate',
  'paymentMode',
]

/** Lower case, punctuation to spaces, single spaces. "Final Settlement Amount (INR)" → "final settlement amount inr". */
export function normalizeHeader(header: unknown): string {
  return String(header ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9%&]+/g, ' ')
    .trim()
}

interface Rule {
  field: ReportField
  patterns: [RegExp, number][]
  exclude?: RegExp
}

const RULES: Rule[] = [
  {
    field: 'subOrderNo',
    patterns: [
      [/\bsub ?order (no|id|number|num)\b/, 10],
      [/\bsuborder\b|\bsub order\b/, 8],
      [/\border (no|id|number)\b/, 5],
    ],
    exclude: /date|status|amount|value/,
  },
  {
    field: 'sku',
    patterns: [
      [/\bsupplier sku\b/, 10],
      [/\bsku\b/, 8],
      [/\bstyle (id|code)\b/, 4],
    ],
    exclude: /name|price|qty|quantity/,
  },
  {
    field: 'productName',
    patterns: [
      [/\bproduct name\b/, 10],
      [/\bitem name\b|\bproduct title\b/, 8],
    ],
  },
  {
    field: 'status',
    patterns: [
      [/\blive order status\b/, 10],
      [/\border status\b/, 9],
      [/\bstatus\b/, 5],
    ],
    exclude: /payment|settlement|claim|ticket/,
  },
  {
    field: 'quantity',
    patterns: [
      [/\bquantity\b/, 10],
      [/\bqty\b/, 9],
    ],
  },
  {
    field: 'listingPrice',
    patterns: [
      [/\blisting price\b/, 10],
      [/\bselling price\b/, 9],
      [/\bsale price\b/, 7],
      [/\bprice\b/, 4],
    ],
    exclude: /total|shipping|return/,
  },
  {
    field: 'shipping',
    patterns: [
      [/\bshipping charges?\b/, 10],
      [/\bforward shipping\b/, 10],
      [/\bshipping\b/, 6],
      [/\bdelivery charges?\b/, 6],
    ],
    exclude: /return|reverse|\brto\b|total sale/,
  },
  {
    field: 'returnShipping',
    patterns: [
      [/\breturn shipping\b|\breverse shipping\b/, 10],
      [/\breturn charges?\b/, 8],
      [/\brto charges?\b/, 6],
    ],
  },
  // "TCS Rate" or "TDS %" is the rate, not the amount deducted.
  { field: 'tcs', patterns: [[/\btcs\b/, 10]], exclude: /\btds\b|rate|%/ },
  { field: 'tds', patterns: [[/\btds\b/, 10]], exclude: /\btcs\b|rate|%/ },
  {
    field: 'settlement',
    patterns: [
      [/\bfinal settlement amount\b/, 10],
      [/\bsettlement amount\b|\bnet settlement\b/, 9],
      [/\bnet payout\b|\bpayout amount\b/, 7],
      [/\bsettlement\b/, 6],
      [/\bamount paid\b/, 5],
    ],
    exclude: /date|status|\bid\b|\bno\b/,
  },
  {
    field: 'orderDate',
    patterns: [
      [/\border date\b/, 10],
      [/\border placed\b/, 8],
    ],
  },
  {
    field: 'paymentMode',
    patterns: [
      [/\bpayment (mode|method|type)\b|\bmode of payment\b/, 10],
      [/\bcod prepaid\b|\bprepaid cod\b/, 8],
    ],
  },
]

const PERSONAL: RegExp[] = [
  /\b(customer|buyer|recipient|consignee|receiver|shipping|billing)s? (name|phone|mobile|contact|address|email|e mail|pin ?code|pincode|zip)\b/,
  /^(name|full name|phone|mobile|mobile no|mobile number|phone no|phone number|contact|contact no|contact number|email|e mail|email id|address|pincode|pin code|pin)$/,
  /\baddress\b/,
  /\b(phone|mobile|contact) (no|number)\b/,
]

export function isPersonal(header: unknown): boolean {
  const h = normalizeHeader(header)
  return h !== '' && PERSONAL.some((re) => re.test(h))
}

function scoreFor(rule: Rule, header: string): number {
  if (header === '' || (rule.exclude && rule.exclude.test(header))) return 0
  let best = 0
  for (const [re, score] of rule.patterns) if (re.test(header) && score > best) best = score
  return best
}

const STATUS_WORDS = /deliver|rto|return|cancel|shipped/i

/**
 * Best header for each field, each header used once.
 * `samples` (a few data rows) break ties, e.g. the status column is the one
 * whose values say Delivered / RTO / Return.
 */
export function detectColumns(headers: string[], samples: unknown[][] = []): Partial<Record<ReportField, number>> {
  const norm = headers.map(normalizeHeader)
  const candidates: { field: ReportField; col: number; score: number }[] = []
  for (const rule of RULES) {
    norm.forEach((h, col) => {
      let score = scoreFor(rule, h)
      if (score === 0) return
      if (rule.field === 'status' && samples.some((r) => STATUS_WORDS.test(String(r[col] ?? '')))) score += 3
      candidates.push({ field: rule.field, col, score })
    })
  }
  candidates.sort((a, b) => b.score - a.score || a.col - b.col)
  const out: Partial<Record<ReportField, number>> = {}
  const used = new Set<number>()
  for (const c of candidates) {
    if (out[c.field] !== undefined || used.has(c.col)) continue
    out[c.field] = c.col
    used.add(c.col)
  }
  return out
}

export function missingRequired(columns: Partial<Record<ReportField, number>>): ReportField[] {
  return REQUIRED_FIELDS.filter((f) => columns[f] === undefined)
}

/** How header-like a row is: the number of cells that match any field strongly. */
export function headerScore(row: unknown[]): number {
  let n = 0
  for (const cell of row) {
    const h = normalizeHeader(cell)
    if (RULES.some((r) => scoreFor(r, h) >= 6) || isPersonal(h)) n += 1
  }
  return n
}

/** Real files can start with title rows; the header is the most header-like of the first 15. */
export function findHeaderRow(rows: unknown[][]): number {
  let best = 0
  let bestScore = -1
  rows.slice(0, 15).forEach((row, i) => {
    const s = headerScore(row ?? [])
    if (s > bestScore) {
      best = i
      bestScore = s
    }
  })
  return best
}

/** Identifies a report layout, so a mapping chosen once is reused next time. */
export function layoutSignature(headers: string[]): string {
  return headers
    .map(normalizeHeader)
    .filter((h) => h !== '')
    .sort()
    .join('|')
}
