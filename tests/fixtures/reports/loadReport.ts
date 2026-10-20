/**
 * Test loader for the report fixtures, through the app's own pipeline:
 * SheetJS read → header-row and keyword column detection → personal columns
 * dropped → order rows. No exact header names anywhere, so every test that
 * loads a fixture also proves the detection works on it.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'

import { type Analysis, analyseWorkbook, buildReport, extractOrders, type ReportData } from '../../../src/app/report/extract'
import { readWorkbook } from '../../../src/app/report/read'
import type { OrderRow } from '../../../src/engine/report'

const HERE = dirname(fileURLToPath(import.meta.url))
export const SYNTHETIC_DIR = join(HERE, 'synthetic')
/** Real redacted reports (gate G2) go here, each folder with its own expected_totals.json. */
export const REAL_DIR = join(HERE, 'real')

export type Sheet = Record<string, unknown>[]

/** Every sheet as rows of { header: value } — for reading the fixtures' side sheets in tests. */
export function loadWorkbook(path: string): Record<string, Sheet> {
  const wb = XLSX.read(readFileSync(path), { type: 'buffer', raw: path.endsWith('.csv') })
  return Object.fromEntries(
    wb.SheetNames.map((name) => [name, XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name]!, { defval: null })]),
  )
}

/** Parsed once per file per test run; callers only read it (buildReport never mutates an Analysis). */
const analysed = new Map<string, Analysis>()

export function analyseFile(path: string): Analysis {
  const cached = analysed.get(path)
  if (cached) return cached
  const name = path.split(/[\\/]/).pop()!
  const result = analyseWorkbook(readWorkbook(new Uint8Array(readFileSync(path)), name), name)
  if ('error' in result) throw new Error(`${name}: ${result.error}`)
  if (result.missing.length) throw new Error(`${name}: columns not found: ${result.missing.join(', ')}`)
  analysed.set(path, result)
  return result
}

/** The order lines as engine rows, plus the side sheets for checks. */
export function loadOrderRows(path: string): { rows: OrderRow[]; sheets: Record<string, Sheet> } {
  const analysis = analyseFile(path)
  return { rows: extractOrders(analysis, analysis.columns).orderRows, sheets: loadWorkbook(path) }
}

export function loadReport(path: string): { analysis: Analysis; data: ReportData } {
  const analysis = analyseFile(path)
  return { analysis, data: buildReport(analysis, analysis.columns) }
}

/** Report files (xlsx / csv) in a fixtures folder, recursively; [] when it doesn't exist. */
export function reportFilesIn(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? reportFilesIn(join(dir, e.name))
      : /\.(xlsx|xls|csv)$/i.test(e.name) && !/sku_costs/i.test(e.name)
        ? [join(dir, e.name)]
        : [],
  )
}
