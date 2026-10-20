/**
 * Price step planner, app side (spec v2, 7.9): finds the report before a
 * step and the report after it, and judges the step with the engine.
 */
import { type StepJudgement, type StepPeriod, judgeStep } from '../../engine/priceStep'
import { type KeepInput, keepPerSale } from '../../engine/keep'
import { calibrate } from '../../engine/report'
import type { PriceStep, Report, SkuStatsRow } from '../db'
import { normSku, toEngineStats } from '../report/store'

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

interface Located {
  row: SkuStatsRow
  report: Report
}

/** The latest report ending before the step started, and the first starting on or after it. */
export function stepReports(step: PriceStep, sku: string | undefined, rows: SkuStatsRow[], reports: Report[]): { before: Located | null; after: Located | null } {
  if (!sku) return { before: null, after: null }
  const start = isoDay(step.startAt)
  const byId = new Map(reports.map((r) => [r.id, r]))
  const mine = rows
    .filter((r) => normSku(r.sku) === normSku(sku))
    .map((row) => ({ row, report: byId.get(row.reportId) }))
    .filter((x): x is Located => Boolean(x.report?.periodFrom && x.report.periodTo && x.report.periodDays))
  const before = mine.filter((x) => x.report.periodTo! < start).sort((a, b) => (a.report.periodTo! < b.report.periodTo! ? 1 : -1))[0] ?? null
  const after = mine.filter((x) => x.report.periodFrom! >= start).sort((a, b) => (a.report.periodFrom! < b.report.periodFrom! ? -1 : 1))[0] ?? null
  return { before, after }
}

function period(loc: Located, base: KeepInput): StepPeriod {
  const stats = toEngineStats(loc.row)
  const input = calibrate(base, stats, { adsTotal: loc.row.ads ?? undefined, penaltiesTotal: loc.row.penalties ?? undefined })
  return { cleanSales: loc.row.deliveredKept, days: loc.report.periodDays!, keep: keepPerSale(input).keep }
}

/** Other products' orders a day in the "after" report ÷ the "before" report. */
export function catalogueRatio(sku: string, beforeId: string, afterId: string, rows: SkuStatsRow[], reports: Report[]): number | null {
  const byId = new Map(reports.map((r) => [r.id, r]))
  const perDay = (reportId: string) => {
    const days = byId.get(reportId)?.periodDays
    if (!days) return null
    const others = rows.filter((r) => r.reportId === reportId && normSku(r.sku) !== normSku(sku))
    if (others.length === 0) return null
    return others.reduce((s, r) => s + r.orders, 0) / days
  }
  const b = perDay(beforeId)
  const a = perDay(afterId)
  return a !== null && b !== null && b > 0 ? a / b : null
}

export function judgeProductStep(args: {
  step: PriceStep
  sku: string | undefined
  base: KeepInput
  rows: SkuStatsRow[]
  reports: Report[]
}): StepJudgement {
  const { step, sku, base, rows, reports } = args
  const { before, after } = stepReports(step, sku, rows, reports)
  return judgeStep({
    before: before ? period(before, base) : null,
    after: after ? period(after, base) : null,
    catalogueRatio: before && after && sku ? catalogueRatio(sku, before.report.id, after.report.id, rows, reports) : null,
  })
}

/** An open step: started and not yet closed by the seller (Keep / Go back / Stop). */
export function openStep(steps: PriceStep[], productId: string): PriceStep | null {
  return steps.filter((s) => s.productId === productId && !s.judgedAt).sort((a, b) => b.startAt - a.startAt)[0] ?? null
}
