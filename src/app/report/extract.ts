/**
 * From a read workbook to per-product totals (spec v2, 6.3 and 7.3). Pure.
 *
 *   analyseWorkbook()  find the order sheet and its header row, drop
 *                      personal columns, detect the rest (or reuse a saved
 *                      mapping for this layout)
 *   buildReport()      total each SKU with the engine, and attach the Ads
 *                      and Compensation sheets
 *
 * After analyseWorkbook() only the sanitised tables are kept: personal
 * columns are gone before any value is read, and nothing downstream can
 * reach them.
 */
import { type SkuStats, type OrderRow, summariseOrders } from '../../engine/report'
import {
  type ReportField,
  detectColumns,
  findHeaderRow,
  isPersonal,
  layoutSignature,
  missingRequired,
  normalizeHeader,
  REQUIRED_FIELDS,
} from './columns'
import type { Grid } from './read'
import { cellText, daysInclusive, toIsoDate, toNumber } from './values'

export const MAX_FILE_BYTES = 10 * 1024 * 1024

export type FileErrorKey = 'upload.err.size' | 'upload.err.pdf' | 'upload.err.type' | 'upload.err.unreadable'

/** Before reading: type by extension, and size (spec 8.3). */
export function checkFileMeta(name: string, size: number): FileErrorKey | null {
  if (/\.pdf$/i.test(name)) return 'upload.err.pdf'
  if (!/\.(xlsx|xls|csv)$/i.test(name)) return 'upload.err.type'
  if (size > MAX_FILE_BYTES) return 'upload.err.size'
  return null
}

/** After reading: the bytes must be what the name says (a renamed PDF is still a PDF). */
export function checkFileBytes(name: string, bytes: Uint8Array): FileErrorKey | null {
  const head = String.fromCharCode(...bytes.slice(0, 4))
  if (head === '%PDF') return 'upload.err.pdf'
  if (/\.xlsx$/i.test(name) && head.slice(0, 2) !== 'PK') return 'upload.err.unreadable'
  if (bytes.length === 0) return 'upload.err.unreadable'
  return null
}

/** A sheet with its header row found and personal columns removed. */
export interface Table {
  name: string
  headers: string[]
  rows: unknown[][]
}

export type Columns = Partial<Record<ReportField, number>>

export interface SavedMapping {
  id: string
  columns: Record<string, string>
}

export interface Analysis {
  fileName: string
  /** The order sheet, sanitised. */
  order: Table
  /** Headers of the columns dropped as personal (names only, never values). */
  personalHeaders: string[]
  columns: Columns
  missing: ReportField[]
  signature: string
  mappingSource: 'saved' | 'auto'
  ads: Table | null
  compensation: Table | null
  /** Labelled SAMPLE / SYNTHETIC: never present it as a real seller's. */
  synthetic: boolean
}

function sanitize(grid: Grid): { table: Table; personal: string[] } {
  const headerRow = findHeaderRow(grid.rows)
  const raw = (grid.rows[headerRow] ?? []).map(cellText)
  const keep: number[] = []
  const personal: string[] = []
  raw.forEach((h, i) => (isPersonal(h) ? personal.push(h) : keep.push(i)))
  return {
    table: {
      name: grid.name,
      headers: keep.map((i) => raw[i] || `Column ${i + 1}`),
      rows: grid.rows
        .slice(headerRow + 1)
        .map((r) => keep.map((i) => r?.[i] ?? null))
        .filter((r) => r.some((c) => cellText(c) !== '')),
    },
    personal,
  }
}

function sheetIs(name: string, re: RegExp): boolean {
  return re.test(normalizeHeader(name))
}

export function analyseWorkbook(grids: Grid[], fileName: string, saved: SavedMapping[] = []): Analysis | { error: 'empty' } {
  const sheets = grids.map((g) => ({ grid: g, ...sanitize(g) })).filter((s) => s.table.rows.length > 0 || s.table.headers.length > 0)
  if (sheets.length === 0) return { error: 'empty' }

  const isOrderName = (n: string) => sheetIs(n, /\border\b.*\bpayment|\bpayment.*\border\b|\borders?\b/)
  const rank = (s: (typeof sheets)[number]) => {
    const found = REQUIRED_FIELDS.filter((f) => detectColumns(s.table.headers)[f] !== undefined).length
    return (isOrderName(s.table.name) ? 100 : 0) + found * 10 + Math.min(s.table.rows.length, 9)
  }
  const chosen = [...sheets].sort((a, b) => rank(b) - rank(a))[0]!
  const order = chosen.table
  if (order.rows.length === 0) return { error: 'empty' }

  const signature = layoutSignature(order.headers)
  const norm = order.headers.map(normalizeHeader)
  let columns: Columns = {}
  let mappingSource: Analysis['mappingSource'] = 'auto'
  const savedMapping = saved.find((m) => m.id === signature)
  if (savedMapping) {
    for (const [field, header] of Object.entries(savedMapping.columns)) {
      const idx = norm.indexOf(normalizeHeader(header))
      if (idx >= 0) columns[field as ReportField] = idx
    }
    if (missingRequired(columns).length === 0) mappingSource = 'saved'
    else columns = {}
  }
  if (mappingSource === 'auto') columns = detectColumns(order.headers, order.rows.slice(0, 20))

  const other = sheets.filter((s) => s !== chosen)
  const ads = other.find((s) => sheetIs(s.table.name, /\bads?\b|advert/))?.table ?? null
  const compensation = other.find((s) => sheetIs(s.table.name, /compensation|recovery|claim/))?.table ?? null
  const synthetic =
    /synthetic|sample/i.test(fileName) ||
    sheets.some((s) => sheetIs(s.table.name, /disclaimer/) && /synthetic/i.test(JSON.stringify(s.table)))

  return {
    fileName,
    order,
    personalHeaders: sheets.flatMap((s) => s.personal),
    columns,
    missing: missingRequired(columns),
    signature,
    mappingSource,
    ads,
    compensation,
    synthetic,
  }
}

/** Header names for a column choice, to save as a mapping. */
export function columnsByName(order: Table, columns: Columns): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [field, idx] of Object.entries(columns)) if (idx !== undefined) out[field] = order.headers[idx]!
  return out
}

/** The first 5 data rows of the chosen columns, for the mapping screen. Personal columns are already gone. */
export function previewValues(order: Table, col: number, n = 5): string[] {
  return order.rows.slice(0, n).map((r) => cellText(r[col]))
}

export interface ReportData {
  orderLines: number
  stats: Map<string, SkuStats>
  names: Map<string, string>
  /** Ads charged per SKU, ₹ (positive); null when the file has no Ads sheet. */
  adsBySku: Map<string, number> | null
  /** True when the Ads sheet had no SKU, so the total was split by orders. */
  adsSplitByOrders: boolean
  /** Net penalties per SKU as a cost (recoveries +, compensation −); null without that sheet. */
  penaltiesBySku: Map<string, number> | null
  periodFrom: string | null
  periodTo: string | null
  periodDays: number | null
  /** False when no order was delivered or returned (spec 8.3). */
  hasOrders: boolean
}

function amountColumn(table: Table, preferred: RegExp): number {
  const norm = table.headers.map(normalizeHeader)
  const first = norm.findIndex((h) => preferred.test(h))
  return first >= 0 ? first : norm.findIndex((h) => /amount|cost|spend|value/.test(h))
}

export interface ExtractedOrders {
  orderRows: OrderRow[]
  names: Map<string, string>
  skuOfSubOrder: Map<string, string>
  from: string | null
  to: string | null
}

/** The order lines as engine rows, read only through the chosen columns. */
export function extractOrders(analysis: Analysis, columns: Columns): ExtractedOrders {
  const get = (row: unknown[], f: ReportField) => (columns[f] === undefined ? undefined : row[columns[f]!])

  const orderRows: OrderRow[] = []
  const names = new Map<string, string>()
  const skuOfSubOrder = new Map<string, string>()
  let from: string | null = null
  let to: string | null = null

  for (const row of analysis.order.rows) {
    const sku = cellText(get(row, 'sku'))
    const status = cellText(get(row, 'status'))
    // Totals and notes rows at the bottom have no SKU or status.
    if (sku === '' || status === '') continue
    orderRows.push({
      sku,
      status,
      quantity: toNumber(get(row, 'quantity')),
      listingPrice: toNumber(get(row, 'listingPrice')),
      shipping: toNumber(get(row, 'shipping')),
      returnShipping: toNumber(get(row, 'returnShipping')),
      tcs: toNumber(get(row, 'tcs')),
      tds: toNumber(get(row, 'tds')),
      settlement: toNumber(get(row, 'settlement')) ?? 0,
    })
    const name = cellText(get(row, 'productName'))
    if (name && !names.has(sku)) names.set(sku, name)
    const sub = cellText(get(row, 'subOrderNo'))
    if (sub) skuOfSubOrder.set(sub, sku)
    const d = toIsoDate(get(row, 'orderDate'))
    if (d) {
      if (from === null || d < from) from = d
      if (to === null || d > to) to = d
    }
  }
  return { orderRows, names, skuOfSubOrder, from, to }
}

export function buildReport(analysis: Analysis, columns: Columns): ReportData {
  const { orderRows, names, skuOfSubOrder, from, to } = extractOrders(analysis, columns)
  const stats = summariseOrders(orderRows)

  let adsBySku: Map<string, number> | null = null
  let adsSplitByOrders = false
  if (analysis.ads) {
    const t = analysis.ads
    const amount = amountColumn(t, /\b(total )?ads? (cost|spend|amount)\b/)
    const skuCol = detectColumns(t.headers).sku
    adsBySku = new Map()
    if (amount >= 0) {
      if (skuCol !== undefined) {
        for (const r of t.rows) {
          const sku = cellText(r[skuCol])
          if (sku) adsBySku.set(sku, (adsBySku.get(sku) ?? 0) + Math.abs(toNumber(r[amount]) ?? 0))
        }
      } else {
        // No SKU on the Ads sheet: split the total by each product's share of orders.
        const total = t.rows.reduce((s, r) => s + Math.abs(toNumber(r[amount]) ?? 0), 0)
        const dispatched = [...stats.values()].reduce((s, x) => s + x.dispatched, 0)
        adsSplitByOrders = total > 0
        for (const [sku, x] of stats) adsBySku.set(sku, dispatched > 0 ? (total * x.dispatched) / dispatched : 0)
      }
    }
  }

  let penaltiesBySku: Map<string, number> | null = null
  if (analysis.compensation) {
    const t = analysis.compensation
    const sub = detectColumns(t.headers).subOrderNo
    const amount = amountColumn(t, /\bamount\b/)
    penaltiesBySku = new Map()
    if (sub !== undefined && amount >= 0) {
      for (const r of t.rows) {
        const sku = skuOfSubOrder.get(cellText(r[sub]))
        const value = toNumber(r[amount])
        // Money paid to the seller lowers their costs; money recovered raises them.
        if (sku && value !== undefined) penaltiesBySku.set(sku, (penaltiesBySku.get(sku) ?? 0) - value)
      }
    }
  }

  return {
    orderLines: orderRows.length,
    stats,
    names,
    adsBySku,
    adsSplitByOrders,
    penaltiesBySku,
    periodFrom: from,
    periodTo: to,
    periodDays: from && to ? daysInclusive(from, to) : null,
    hasOrders: [...stats.values()].some((x) => x.delivered > 0),
  }
}
