/**
 * Report upload (spec v2, 7.3): the hero.
 *
 *   /upload               pick a file (button or drag-and-drop), read it on the phone
 *   /upload/map           only when a required column wasn't found
 *   /upload/done/:id      reconciliation per product, and cost entry for new ones
 *
 * The file is parsed in memory with SheetJS (loaded on demand) and never
 * stored. Personal columns are dropped as soon as the header row is found;
 * the mapping screen can't show them. Going back from the mapping screen
 * discards the file (spec 8.2).
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
import { Link, Navigate, Outlet, useNavigate, useParams } from 'react-router-dom'

import { categoryNames } from '../../data/categoryNames'
import { inr, pct } from '../../engine/format'
import { defaultKeepInput } from '../../engine/keep'
import { type Reconciliation, reconcileReport } from '../../engine/report'
import { type MessageKey, useI18n, useT } from '../../i18n'
import { type Product, type Report, type Shop, type SkuStatsRow, db } from '../db'
import { useProducts, useShop } from '../hooks'
import { parseAmount } from '../lib/validate'
import { summarise } from '../lib/products'
import { ALL_FIELDS, REQUIRED_FIELDS, type ReportField } from '../report/columns'
import {
  type Analysis,
  type Columns,
  analyseWorkbook,
  buildReport,
  checkFileBytes,
  checkFileMeta,
  columnsByName,
  previewValues,
} from '../report/extract'
import { sha256Hex } from '../report/hash'
import { type QuickEntry, addFromReport, findDuplicate, normSku, saveMapping, saveReport, toEngineStats } from '../report/store'
import { queueBenchmarks } from '../benchmarks'
import { track } from '../telemetry'
import { useToast } from '../toast'
import { BackButton, Button, ButtonLink, Card, LoadingPage, PageTitle, STATUS_TEXT, StatusBadge, buttonClass } from '../ui'

// ------------------------------------------------------------ pending file

interface Pending {
  fileName: string
  fileHash: string
  analysis: Analysis
}

const PendingContext = createContext<{ pending: Pending | null; setPending: (p: Pending | null) => void }>({
  pending: null,
  setPending: () => {},
})

/** Holds the file being uploaded, in memory only, while it moves between steps. */
export function UploadLayout() {
  const [pending, setPending] = useState<Pending | null>(null)
  return (
    <PendingContext.Provider value={{ pending, setPending }}>
      <Outlet />
    </PendingContext.Provider>
  )
}

/** Totals the file with the chosen columns, saves it, and opens the result. */
function useFinish(): (p: Pending, columns: Columns, mappingId: string) => Promise<MessageKey | null> {
  const navigate = useNavigate()
  return async (p, columns, mappingId) => {
    const data = buildReport(p.analysis, columns)
    if (data.orderLines === 0) return 'upload.err.empty'
    if (!data.hasOrders) return 'upload.err.noOrders'
    const report = await saveReport({
      fileName: p.fileName,
      fileHash: p.fileHash,
      data,
      mappingId,
      synthetic: p.analysis.synthetic,
    })
    void track('report_uploaded', { products: data.stats.size })
    void queueBenchmarks(report.id)
    navigate(`/upload/done/${report.id}`, { replace: true })
    return null
  }
}

async function readBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer())
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}

function useDateFormat(): (iso: string | number) => string {
  const { lang } = useI18n()
  const fmt = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  return (v) => fmt.format(typeof v === 'number' ? new Date(v) : new Date(`${v}T00:00:00`))
}

// ------------------------------------------------------------- 1. choose

type StartState =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'error'; key: MessageKey }
  | { kind: 'duplicate'; report: Report }

export function UploadStart() {
  const t = useT()
  const navigate = useNavigate()
  const finish = useFinish()
  const formatDate = useDateFormat()
  const { setPending } = useContext(PendingContext)
  const [state, setState] = useState<StartState>({ kind: 'idle' })
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Arriving here (including Back from the mapping screen) discards any file in progress.
  useEffect(() => setPending(null), [setPending])

  const handle = async (file: File) => {
    const metaError = checkFileMeta(file.name, file.size)
    if (metaError) return setState({ kind: 'error', key: metaError })
    setState({ kind: 'reading' })
    try {
      const bytes = await readBytes(file)
      const byteError = checkFileBytes(file.name, bytes)
      if (byteError) return setState({ kind: 'error', key: byteError })
      const fileHash = await sha256Hex(bytes)
      const duplicate = await findDuplicate(fileHash)
      if (duplicate) return setState({ kind: 'duplicate', report: duplicate })

      const { readWorkbook } = await import('../report/read')
      const analysis = analyseWorkbook(readWorkbook(bytes, file.name), file.name, await db.mappings.toArray())
      if ('error' in analysis) return setState({ kind: 'error', key: 'upload.err.empty' })

      const pending: Pending = { fileName: file.name, fileHash, analysis }
      if (analysis.missing.length > 0) {
        setPending(pending)
        navigate('/upload/map')
        return
      }
      const error = await finish(pending, analysis.columns, analysis.mappingSource === 'saved' ? analysis.signature : 'auto')
      if (error) setState({ kind: 'error', key: error })
    } catch {
      setState({ kind: 'error', key: 'upload.err.unreadable' })
    }
  }

  const onFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (file) void handle(file)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start lg:gap-10">
      <section className="flex min-w-0 flex-col gap-4">
        <PageTitle>{t('upload.title')}</PageTitle>
        <p className="text-base text-body">{t('upload.lead')}</p>

        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            onFiles(e.dataTransfer.files)
          }}
          className={`flex flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed px-4 py-8 text-center has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-orange lg:py-14 ${
            dragOver ? 'border-orange bg-peach' : 'border-plum/30 bg-lilac/40'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="sr-only"
            aria-label={t('upload.choose')}
            onChange={(e) => onFiles(e.target.files)}
            disabled={state.kind === 'reading'}
          />
          <span className={buttonClass('primary', 'pointer-events-none')}>{t('upload.choose')}</span>
          <span className="hidden text-base text-body lg:block">{t('upload.drop')}</span>
          <span className="text-sm text-muted">{t('upload.accepts')}</span>
        </label>

        <div aria-live="polite">
          {state.kind === 'reading' ? <p className="text-base font-medium text-plum">{t('upload.reading')}</p> : null}
          {state.kind === 'error' ? (
            <p role="alert" className="rounded-card border-2 border-loss bg-loss/5 p-3 text-base font-medium text-loss">
              {t(state.key)}
            </p>
          ) : null}
          {state.kind === 'duplicate' ? (
            <Card tone="peach">
              <p role="alert" className="text-base font-semibold text-ink">
                {t('upload.duplicate', { date: formatDate(state.report.uploadedAt) })}
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <ButtonLink to={`/upload/done/${state.report.id}`}>{t('upload.viewReport')}</ButtonLink>
                <Button variant="secondary" onClick={() => setState({ kind: 'idle' })}>
                  {t('upload.tryAnother')}
                </Button>
              </div>
            </Card>
          ) : null}
        </div>
      </section>

      <Card tone="lilac">
        <h2 className="text-lg font-semibold text-ink">{t('upload.howTitle')}</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-base text-body">
          <li>{t('upload.step1')}</li>
          <li>{t('upload.step2')}</li>
          <li>{t('upload.step3')}</li>
          <li>{t('upload.step4')}</li>
        </ol>
        <p className="mt-3 text-sm text-muted">{t('upload.privacy')}</p>
      </Card>
    </div>
  )
}

// --------------------------------------------------------------- 2. map

export function MapColumns() {
  const t = useT()
  const navigate = useNavigate()
  const finish = useFinish()
  const { pending } = useContext(PendingContext)
  const [columns, setColumns] = useState<Columns>(() => pending?.analysis.columns ?? {})
  const [error, setError] = useState<MessageKey | null>(null)
  const [saving, setSaving] = useState(false)

  if (!pending) return <Navigate to="/upload" replace />
  const { order, personalHeaders, signature } = pending.analysis
  const missing = REQUIRED_FIELDS.filter((f) => columns[f] === undefined)
  const chosen = ALL_FIELDS.filter((f) => columns[f] !== undefined)

  const submit = async () => {
    setSaving(true)
    await saveMapping(signature, columnsByName(order, columns))
    const err = await finish(pending, columns, signature)
    if (err) {
      setError(err)
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <BackButton onClick={() => navigate('/upload')} />
      </div>
      <PageTitle>{t('map.title')}</PageTitle>
      <p className="text-base text-body">{t('map.lead')}</p>
      {personalHeaders.length > 0 ? <p className="text-sm text-muted">{t('map.personalNote')}</p> : null}

      <div className="grid gap-5 md:grid-cols-2">
        {ALL_FIELDS.map((field) => (
          <ColumnSelect
            key={field}
            field={field}
            required={REQUIRED_FIELDS.includes(field)}
            headers={order.headers}
            value={columns[field]}
            samples={columns[field] === undefined ? [] : previewValues(order, columns[field]!).filter(Boolean).slice(0, 3)}
            onChange={(col) =>
              setColumns((c) => {
                const next = { ...c }
                if (col === undefined) delete next[field]
                else next[field] = col
                return next
              })
            }
          />
        ))}
      </div>

      {chosen.length > 0 ? (
        <section>
          <h2 className="mb-2 text-lg font-semibold text-ink">{t('map.preview')}</h2>
          <div className="overflow-x-auto rounded-card border border-plum/15">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-lilac">
                <tr>
                  {chosen.map((f) => (
                    <th key={f} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold text-ink">
                      {order.headers[columns[f]!]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2, 3, 4].map((i) =>
                  order.rows[i] ? (
                    <tr key={i} className="border-t border-plum/10">
                      {chosen.map((f) => (
                        <td key={f} className="whitespace-nowrap px-3 py-2 text-body">
                          {previewValues(order, columns[f]!)[i]}
                        </td>
                      ))}
                    </tr>
                  ) : null,
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-card border-2 border-loss bg-loss/5 p-3 text-base font-medium text-loss">
          {t(error)}
        </p>
      ) : null}

      <div className="pb-safe sticky bottom-0 -mx-4 border-t border-plum/10 bg-white/95 px-4 py-3 md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
          <Button disabled={missing.length > 0 || saving} onClick={() => void submit()} className="w-full md:w-auto">
            {t('map.continue')}
          </Button>
          {missing.length > 0 ? <p className="text-sm text-muted">{t('map.missing')}</p> : null}
        </div>
      </div>
    </div>
  )
}

function ColumnSelect({
  field,
  required,
  headers,
  value,
  samples,
  onChange,
}: {
  field: ReportField
  required: boolean
  headers: string[]
  value: number | undefined
  samples: string[]
  onChange: (col: number | undefined) => void
}) {
  const t = useT()
  const id = `map-${field}`
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-base font-medium text-ink">
          {t(`map.q.${field}`)}
        </label>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${required ? 'bg-plum/10 text-plum' : 'bg-lilac text-muted'}`}>
          {required ? t('map.required') : t('common.optional')}
        </span>
      </div>
      <select
        id={id}
        value={value === undefined ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        className={`min-h-tap w-full min-w-0 rounded-xl border-2 bg-white px-3 text-base text-ink focus:outline-none focus:ring-2 focus:ring-orange ${
          required && value === undefined ? 'border-loss' : 'border-plum/20'
        }`}
      >
        <option value="">{required ? t('map.choose') : t('map.none')}</option>
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {h}
          </option>
        ))}
      </select>
      {samples.length > 0 ? <p className="text-sm text-muted">{t('map.examples', { values: samples.join(', ') })}</p> : null}
    </div>
  )
}

// -------------------------------------------------------------- 3. result

export function UploadDone() {
  const t = useT()
  const { reportId } = useParams()
  const formatDate = useDateFormat()
  const report = useLiveQuery(async () => (reportId ? ((await db.reports.get(reportId)) ?? null) : null), [reportId])
  const rows = useLiveQuery(() => (reportId ? db.skuStats.where('reportId').equals(reportId).toArray() : []), [reportId])
  const products = useProducts()
  const shop = useShop()

  if (report === undefined || rows === undefined || products === undefined || !shop) return <LoadingPage />
  if (report === null) {
    return (
      <Card>
        <p className="text-base">{t('done.notFound')}</p>
        <ButtonLink to="/upload" className="mt-3">
          {t('upload.title')}
        </ButtonLink>
      </Card>
    )
  }

  const bySku = new Map(products.filter((p) => p.sku).map((p) => [normSku(p.sku), p]))
  const matched = rows.filter((r) => bySku.has(normSku(r.sku)))
  const unmatched = rows.filter((r) => !bySku.has(normSku(r.sku)))
  const period =
    report.periodFrom && report.periodTo ? `${formatDate(report.periodFrom)} – ${formatDate(report.periodTo)}` : null

  return (
    <div className="flex flex-col gap-5">
      <PageTitle>{t('done.title')}</PageTitle>
      {report.synthetic ? <SampleBanner /> : null}
      <p className="text-base text-body">
        {t('done.summary', { products: rows.length, orders: report.orderLines })}
        {period ? ` · ${period}` : ''}
      </p>
      {report.adsSplitByOrders ? <p className="text-sm text-muted">{t('done.adsSplit')}</p> : null}

      {unmatched.length > 0 ? <QuickCostEntry rows={unmatched} products={products} shop={shop} /> : null}

      {matched.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold text-ink">{t('done.matchedTitle')}</h2>
          <ul className="grid gap-3 lg:grid-cols-2">
            {matched.map((row) => (
              <li key={row.id}>
                <MatchedRow row={row} report={report} product={bySku.get(normSku(row.sku))!} shop={shop} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ButtonLink to="/home" className="self-start">
        {t('done.seeHome')}
      </ButtonLink>
    </div>
  )
}

export function SampleBanner() {
  const t = useT()
  return (
    <p className="rounded-card border-2 border-thin bg-peach px-3 py-2 text-base font-semibold text-thin">
      {t('upload.sample')}
    </p>
  )
}

function RowFacts({ row }: { row: SkuStatsRow }) {
  const t = useT()
  const s = toEngineStats(row)
  return (
    <p className="text-sm text-body/80">
      {t('done.facts', { orders: row.orders, rto: pct(s.rtoRate, 0), returns: pct(s.returnRate, 0) })}
      {s.lowData ? <span className="ml-2 rounded-full bg-peach px-2 py-0.5 text-xs font-semibold text-thin">{t('done.lowDataChip')}</span> : null}
    </p>
  )
}

function MatchedRow({ row, report, product, shop }: { row: SkuStatsRow; report: Report; product: Product; shop: Shop }) {
  const t = useT()
  const s = summarise(product, shop, { row, report })
  return (
    <Card className="flex h-full flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <Link to={`/products/${product.id}`} className="min-w-0 break-words text-lg font-semibold text-plum underline-offset-2 hover:underline">
          {product.name}
        </Link>
        <StatusBadge status={s.status} />
      </div>
      <RowFacts row={row} />
      <p className={`text-base font-semibold ${STATUS_TEXT[s.status]}`}>
        {s.result.keep >= 0
          ? t('home.keepPerSale', { amount: inr(s.result.keep) })
          : t('home.losePerSale', { amount: inr(Math.abs(s.result.keep)) })}
      </p>
      {s.report ? <ReconciliationNote rec={s.report.reconciliation} lowData={toEngineStats(row).lowData} /> : null}
    </Card>
  )
}

/** "Matches your report ✓", or how far off we were and why (spec 6.3). */
export function ReconciliationNote({ rec, lowData }: { rec: Reconciliation; lowData: boolean }) {
  const t = useT()
  if (rec.status === 'NO_DELIVERIES') return <p className="text-sm text-muted">{t('done.noDeliveries')}</p>
  const g = 1.18
  const fmt = (field: string, v: number | boolean) => {
    if (typeof v === 'boolean') return v ? t('common.yes') : t('common.no')
    if (field === 'fwdPerDelivered' || field === 'revPerReturn') return inr(v * g, 2)
    if (field === 'rtoRate' || field === 'returnRate') return pct(v, 1)
    return inr(v, 2)
  }
  return (
    <div className="flex flex-col gap-1">
      {rec.status === 'MATCHES' ? (
        <p className="text-base font-semibold text-healthy">
          {t('done.matches')}{' '}
          <span className="font-normal text-body/80">{t('done.matchesDetail', { pct: pct(Math.abs(rec.differencePct), 1) })}</span>
        </p>
      ) : (
        <>
          <p className="text-base font-semibold text-thin">{t('done.differs', { amount: inr(Math.abs(rec.difference), 2) })}</p>
          {rec.gapLines.length > 0 ? (
            <ul className="list-disc pl-5 text-sm text-body">
              {rec.gapLines.map((g2) => (
                <li key={g2.field}>
                  {t('done.gapLine', {
                    label: t(`gap.${g2.field}` as MessageKey),
                    model: fmt(g2.field, g2.model),
                    report: fmt(g2.field, g2.report),
                  })}
                </li>
              ))}
            </ul>
          ) : null}
          {rec.gapLines.some((g2) => g2.field === 'fwdPerDelivered' || g2.field === 'revPerReturn') ? (
            <p className="text-sm text-body/80">{t('done.weightHint')}</p>
          ) : null}
        </>
      )}
      {lowData ? <p className="text-sm text-thin">{t('done.lowData')}</p> : null}
    </div>
  )
}

function QuickCostEntry({ rows, products, shop }: { rows: SkuStatsRow[]; products: Product[]; shop: Shop }) {
  const { t, pick } = useI18n()
  const toast = useToast()
  const [costs, setCosts] = useState<Record<string, string>>({})
  const [links, setLinks] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  // Products the seller typed in without a SKU can be linked instead of duplicated.
  const linkable = products.filter((p) => !p.sku)

  const entries: QuickEntry[] = rows.flatMap((r): QuickEntry[] => {
    const linkTo = links[r.id]
    const cost = parseAmount(costs[r.id] ?? '')
    if (linkTo) return [{ sku: r.sku, name: r.productName, price: r.avgPrice ?? 0, linkTo }]
    if (cost !== null && !Number.isNaN(cost) && cost > 0) return [{ sku: r.sku, name: r.productName, price: r.avgPrice ?? 0, cost }]
    return []
  })

  const save = async () => {
    setSaving(true)
    const ids = await addFromReport(entries, shop)
    setSaving(false)
    toast({ message: ids.length === 1 ? t('done.addedOne') : t('done.added', { n: ids.length }) })
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold text-ink">
        {rows.length === 1 ? t('done.unmatchedOne') : t('done.unmatched', { n: rows.length })}
      </h2>
      <ul className="grid gap-3 lg:grid-cols-2">
        {rows.map((row) => (
          <li key={row.id}>
            <Card className="flex h-full flex-col gap-3">
              <div>
                <p className="break-words text-lg font-semibold text-ink">{row.productName}</p>
                <p className="text-sm text-muted">
                  {row.sku}
                  {row.avgPrice !== null ? ` · ${inr(row.avgPrice)}` : ''}
                </p>
              </div>
              <RowFacts row={row} />
              <ProvisionalRecon row={row} shop={shop} />
              <QuickField
                label={t('done.cost')}
                value={costs[row.id] ?? ''}
                disabled={Boolean(links[row.id])}
                onChange={(v) => setCosts((c) => ({ ...c, [row.id]: v }))}
              />
              {linkable.length > 0 ? (
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-ink">{t('done.linkTo')}</span>
                  <select
                    value={links[row.id] ?? ''}
                    onChange={(e) => setLinks((l) => ({ ...l, [row.id]: e.target.value }))}
                    className="min-h-tap w-full min-w-0 rounded-xl border-2 border-plum/20 bg-white px-3 text-base text-ink focus:outline-none focus:ring-2 focus:ring-orange"
                  >
                    <option value="">{t('done.linkNone')}</option>
                    {linkable.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button disabled={entries.length === 0 || saving} onClick={() => void save()}>
          {t('done.saveCosts')}
        </Button>
        <p className="text-sm text-muted">{t('done.costHint', { category: categoryName(shop.category, pick) })}</p>
      </div>
    </section>
  )
}

function categoryName(id: string, pick: (pair: { en: string; hi: string }) => string): string {
  const c = categoryNames.find((x) => x.id === id)
  return c ? pick({ en: c.name_en, hi: c.name_hi }) : id
}

/** Before a product exists, the fee check still runs on the shop's defaults (cost doesn't enter it). */
function ProvisionalRecon({ row, shop }: { row: SkuStatsRow; shop: Shop }) {
  const input = defaultKeepInput(
    shop.category,
    { price: row.avgPrice ?? 0, cost: 0 },
    { gstRegistered: shop.gstRegistered, buyerRegion: shop.buyerRegion, prepaidDiscount: shop.prepaidDiscount },
  )
  const rec = reconcileReport(input, toEngineStats(row), {
    adsTotal: row.ads ?? undefined,
    penaltiesTotal: row.penalties ?? undefined,
  })
  return <ReconciliationNote rec={rec} lowData={toEngineStats(row).lowData} />
}

function QuickField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-base font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-tap w-full min-w-0 rounded-xl border-2 border-plum/20 bg-white px-3 text-base text-ink focus:outline-none focus:ring-2 focus:ring-orange disabled:opacity-50"
      />
    </div>
  )
}
