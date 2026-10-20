/**
 * Product detail: the floor card (spec v2, 7.6).
 *
 *   the big answer ("At ₹300 you keep ₹X per sale"), the naive margin for
 *   contrast, the floor, "if returns rise 5 points", the funnel;
 *   "What to do": up to 3 actions, each with its rupee effect;
 *   "Why": every cost line per clean sale with its source chip, and "Show
 *   working" for the arithmetic in paise.
 *
 * Only costs the seller pays; no Meesho-cost lines (hard rule 4). The price
 * helper and sale check are their own screens, one answer each.
 */
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { categoryNames } from '../../data/categoryNames'
import { rates } from '../../data/rates'
import { inr, num, pct, units } from '../../engine/format'
import { keepIfReturnsRise, sourceOf } from '../../engine/keep'
import { type MessageKey, useI18n, useT } from '../../i18n'
import { useBack } from '../hooks'
import { type Action, type WhyLine, whyTable } from '../lib/floorCard'
import { CHIP_FIELDS, type ChipField, type ProductSummary } from '../lib/products'
import { type ProductModel, useProductModel } from '../productModel'
import { toEngineStats } from '../report/store'
import { closePriceStep, deleteProduct, restoreProduct, undoPrice } from '../repo'
import { useToast } from '../toast'
import { BackButton, Button, Card, LoadingPage, STATUS_TEXT, SourceChip, StatusBadge, buttonClass } from '../ui'
import { ReconciliationNote, SampleBanner } from './Upload'

export function ProductDetail() {
  const t = useT()
  const { id } = useParams()
  const model = useProductModel(id)
  const back = useBack('/home')
  const toast = useToast()

  if (model === undefined) return <LoadingPage />
  if (model === null) return <ProductNotFound onBack={back} />

  const { product, summary } = model
  const { result, input, status } = summary
  const up = keepIfReturnsRise(input)

  const remove = async () => {
    const deleted = await deleteProduct(product.id)
    back()
    if (deleted) toast({ message: t('product.deleted', { name: product.name }), onUndo: () => void restoreProduct(deleted) })
  }

  return (
    <article className="flex flex-col gap-4">
      <div className="lg:hidden">
        <BackButton onClick={back} />
      </div>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="min-w-0 break-words text-xl font-semibold text-ink">{product.name}</h1>
          <StatusBadge status={status} />
        </div>
        <p className={`text-3xl font-bold leading-tight md:text-4xl ${STATUS_TEXT[status]}`}>
          {result.viable && result.keep >= 0
            ? t('detail.keepHeadline', { price: inr(input.price), keep: inr(result.keep) })
            : t('detail.loseHeadline', { price: inr(input.price), loss: result.viable ? inr(-result.keep) : '—' })}
        </p>
        <p className="text-base text-body/80">{t('detail.think', { amount: inr(result.naiveMargin) })}</p>
        {input.adPerOrder === 0 && sourceOf(input, 'adPerOrder') === 'ESTIMATED' ? (
          <span className="self-start rounded-full bg-peach px-2.5 py-0.5 text-sm font-semibold text-thin">{t('detail.adsNotIncluded')}</span>
        ) : null}
        <p className="text-lg font-semibold text-ink">
          {result.viable ? t('detail.floor', { floor: inr(result.floor) }) : t('detail.noFloor')}
        </p>
        {up.viable ? <p className="text-base text-body/80">{t('detail.returnsUp', { floor: inr(up.floor) })}</p> : null}
        <p className="text-base text-body/80">{t('detail.funnel', { n: Math.round(result.C) })}</p>
        {summary.monthly !== null ? (
          <p className="text-base font-medium text-ink">
            {summary.monthlySource === 'report'
              ? t('detail.monthlyReport', { amount: inr(summary.monthly) })
              : t('detail.monthly', { amount: inr(summary.monthly), orders: product.ordersPerWeek ?? 0 })}
          </p>
        ) : null}
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          <Link to={`/products/${product.id}/price`} className={buttonClass('primary')}>
            {t('price.open')}
          </Link>
          <Link to={`/products/${product.id}/sale`} className={buttonClass('secondary')}>
            {t('sale.open')}
          </Link>
        </div>
      </Card>

      {model.step ? <StepCard model={model} /> : null}
      <WhatToDo model={model} />
      <WhyCard summary={summary} />
      {summary.report ? <ReportCard link={summary.report} /> : null}

      <p className="text-sm text-muted">{t('detail.disclaimer')}</p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link to={`/products/${product.id}/edit`} className={buttonClass('secondary')}>
          {t('common.edit')}
        </Link>
        <Button variant="danger" onClick={() => void remove()}>
          {t('common.delete')}
        </Button>
      </div>
    </article>
  )
}

export function ProductNotFound({ onBack }: { onBack: () => void }) {
  const t = useT()
  return (
    <div className="flex flex-col gap-3">
      <div className="lg:hidden">
        <BackButton onClick={onBack} />
      </div>
      <Card>
        <p className="text-base">{t('detail.notFound')}</p>
      </Card>
    </div>
  )
}

// ------------------------------------------------------------ price step

/** The price step being tried (spec 7.9): honest "too early" until the data is there. */
function StepCard({ model }: { model: ProductModel }) {
  const { t, lang } = useI18n()
  const toast = useToast()
  const { step, judgement } = model.step!
  const fmt = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' })
  const money = (v: number | null) => (v === null ? '—' : inr(v))

  const close = async (verdict: 'KEEP' | 'GO_BACK' | 'TOO_EARLY') => {
    const change = await closePriceStep(step.id, verdict)
    toast({
      message: verdict === 'GO_BACK' ? t('step.wentBack', { price: inr(step.oldPrice) }) : t('step.closed'),
      onUndo: change ? () => void undoPrice(change) : undefined,
    })
  }

  return (
    <Card tone="lilac" className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-ink">{t('step.title')}</h2>
      <p className="text-base text-body">
        {t('step.running', { to: inr(step.newPrice), from: inr(step.oldPrice), date: fmt.format(new Date(step.startAt)) })}
      </p>
      {judgement.verdict === 'TOO_EARLY' ? (
        <p className="text-base font-medium text-plum">
          {judgement.reason === 'SMALL_CHANGE'
            ? t('step.small', { before: money(judgement.profitPerDayBefore), after: money(judgement.profitPerDayAfter) })
            : t(`step.early.${judgement.reason ?? 'NO_AFTER'}` as MessageKey)}
        </p>
      ) : (
        <>
          <p className={`text-lg font-semibold ${judgement.verdict === 'KEEP' ? 'text-healthy' : 'text-loss'}`}>
            {judgement.verdict === 'KEEP'
              ? t('step.keep', { to: inr(step.newPrice), before: money(judgement.profitPerDayBefore), after: money(judgement.profitPerDayAfter) })
              : t('step.goBack', { from: inr(step.oldPrice), before: money(judgement.profitPerDayBefore), after: money(judgement.profitPerDayAfter) })}
          </p>
          {judgement.catalogueRatio !== 1 ? <p className="text-sm text-muted">{t('step.adjusted')}</p> : null}
        </>
      )}
      <div className="mt-1 flex flex-wrap gap-2">
        {judgement.verdict === 'KEEP' ? <Button onClick={() => void close('KEEP')}>{t('step.btnKeep')}</Button> : null}
        {judgement.verdict === 'GO_BACK' ? (
          <Button onClick={() => void close('GO_BACK')}>{t('step.btnGoBack', { from: inr(step.oldPrice) })}</Button>
        ) : null}
        <Button variant="ghost" onClick={() => void close('TOO_EARLY')}>
          {t('step.btnStop')}
        </Button>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------- what to do

function WhatToDo({ model }: { model: ProductModel }) {
  const { t, pick } = useI18n()
  const { actions, product, summary } = model
  if (actions.length === 0) {
    return summary.status === 'HEALTHY' ? (
      <Card tone="lilac">
        <h2 className="text-lg font-semibold text-ink">{t('todo.title')}</h2>
        <p className="mt-1 text-base text-body">{t('todo.nothing')}</p>
      </Card>
    ) : null
  }
  const cat = categoryNames.find((c) => c.id === product.category)
  const categoryName = cat ? pick({ en: cat.name_en, hi: cat.name_hi }) : product.category
  const effect = (a: Action) => t('todo.effect', { keep: inr(a.newKeep), delta: inr(a.effect) })

  return (
    <Card tone="peach">
      <h2 className="text-lg font-semibold text-ink">{t('todo.title')}</h2>
      <ol className="mt-3 flex flex-col gap-4">
        {actions.map((a, i) => (
          <li key={a.id} className="flex gap-3">
            <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-plum text-base font-bold text-white">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold text-ink">
                {a.id === 'price' ? t('todo.price', { price: inr(a.price!) }) : t(`todo.${a.id}` as MessageKey)}
              </p>
              <p className="text-base font-semibold text-healthy">{effect(a)}</p>
              <p className="text-sm text-body/80">
                {a.id === 'prepaid'
                  ? t('todo.prepaidWhy')
                  : a.id === 'listing'
                    ? t('todo.listingWhy', {
                        rate: pct(summary.input.returnRate, 0),
                        category: categoryName,
                        norm: pct(rates.categories[product.category]?.returnRate ?? 0, 0),
                      })
                    : t('todo.priceWhy', { stage: t(`stage.${model.stage}` as MessageKey) })}
              </p>
              {a.id === 'price' ? (
                <Link to={`/products/${product.id}/price`} className="mt-1 inline-flex min-h-tap items-center text-base font-medium text-plum underline underline-offset-4">
                  {t('price.open')}
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  )
}

// ----------------------------------------------------------------- why

function WhyCard({ summary }: { summary: ProductSummary }) {
  const t = useT()
  const [working, setWorking] = useState(false)
  const table = whyTable(summary.input, summary.result)
  if (!summary.result.viable) return null

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">{t('why.title')}</h2>
        <button
          type="button"
          aria-expanded={working}
          onClick={() => setWorking((w) => !w)}
          className="inline-flex min-h-tap items-center rounded-xl px-3 text-base font-medium text-plum hover:bg-lilac"
        >
          {working ? t('why.hideWorking') : t('why.showWorking')}
        </button>
      </div>
      <p className="mt-1 text-sm text-muted">{t('why.lead', { n: units(Math.round(table.cleanSales * 10) / 10) })}</p>

      <table className="mt-3 w-full text-left text-base">
        <thead className="sr-only">
          <tr>
            <th scope="col">{t('why.colLine')}</th>
            <th scope="col">{t('why.colPerSale')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-plum/10">
          {table.lines
            .filter((l) => l.key !== 'outputGst')
            .map((l) => (
              <WhyRow key={l.key} line={l} working={working} clean={table.cleanSales} gstRegistered={summary.input.gstRegistered} />
            ))}
          <tr>
            <th scope="row" className="py-2 font-semibold text-ink">
              {t('why.netFloor')}
            </th>
            <td className="py-2 text-right font-semibold text-ink">{inr(table.netFloor, working ? 2 : 0)}</td>
          </tr>
          {table.lines
            .filter((l) => l.key === 'outputGst')
            .map((l) => (
              <WhyRow key={l.key} line={l} working={working} clean={table.cleanSales} gstRegistered={summary.input.gstRegistered} />
            ))}
          <tr className="border-t-2 border-plum/20">
            <th scope="row" className="py-2 text-lg font-bold text-ink">
              {t('why.floor')}
            </th>
            <td className="py-2 text-right text-lg font-bold text-ink">{inr(table.floor, working ? 2 : 0)}</td>
          </tr>
        </tbody>
      </table>

      {working ? <InputsList summary={summary} /> : null}
    </Card>
  )
}

/** Counts in the working: whole numbers stay whole, fractions keep two decimals (13.03). */
const count = (x: number) => (Number.isInteger(x) ? units(x) : num(x, 2))

function WhyRow({ line, working, clean, gstRegistered }: { line: WhyLine; working: boolean; clean: number; gstRegistered: boolean }) {
  const t = useT()
  const [a = 0, b = 0, c = 0] = line.parts
  const formula = (() => {
    switch (line.key) {
      case 'cost':
        return null
      case 'forward':
      case 'reverse':
        return `${count(a)} × ${inr(b, 2)}`
      case 'packaging':
      case 'ads':
      case 'penalties':
        return `${count(a)} × ${inr(b, 2)}`
      case 'writeOff':
        return `${count(a)} × ${pct(b, 0)} × ${inr(c, 2)}`
      case 'feeGst':
        return gstRegistered ? t('why.feeGstClaimed', { amount: inr(a, 2) }) : t('why.feeGstFormula', { amount: inr(a, 2) })
      case 'outputGst':
        return `${pct(a, 0)} × ${inr(b, 2)}`
    }
  })()
  const perClean = line.per100 > 0 ? t('why.tail', { total: inr(line.per100, 2), clean: count(clean) }) : null
  return (
    <tr>
      <th scope="row" className="py-2 pr-2 align-top font-normal text-body">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {t(`why.${line.key}` as MessageKey)}
          <SourceChip source={line.source} />
        </span>
        {working && formula ? (
          <span className="mt-0.5 block text-sm text-muted">
            {perClean ? `${formula} = ${perClean}` : formula}
          </span>
        ) : null}
      </th>
      <td className="py-2 text-right align-top font-semibold text-ink">{inr(line.perSale, working ? 2 : 0)}</td>
    </tr>
  )
}

/** The rates behind the lines, with their sources (shown with the working). */
function InputsList({ summary }: { summary: ProductSummary }) {
  const t = useT()
  const { input } = summary
  const feeGst = 1 + rates.feeGstRate
  const valueOf = (field: ChipField): string => {
    switch (field) {
      case 'fwdPerDelivered':
        return t('input.withGst', { amount: inr(input.fwdPerDelivered * feeGst, 2) })
      case 'revPerReturn':
        return t('input.withGst', { amount: inr(input.revPerReturn * feeGst, 2) })
      case 'rtoRate':
        return pct(input.rtoRate, 1)
      case 'returnRate':
        return pct(input.returnRate, 1)
      case 'unsellableShare':
        return pct(input.unsellableShare, 0)
      case 'packagingPerOrder':
        return inr(input.packagingPerOrder, 2)
      case 'adPerOrder':
        return inr(input.adPerOrder, 2)
      case 'outputGstRate':
        return input.gstRegistered ? pct(input.outputGstRate, 0) : t('input.notRegistered')
    }
  }
  return (
    <div className="mt-4 border-t border-plum/10 pt-3">
      <h3 className="text-base font-semibold text-ink">{t('detail.inputsTitle')}</h3>
      <dl className="mt-2 divide-y divide-plum/10">
        {CHIP_FIELDS.map((f) => (
          <div key={f} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
            <dt className="min-w-0 text-base text-body">{t(`input.${f}`)}</dt>
            <dd className="flex items-center gap-2 text-base font-semibold text-ink">
              {valueOf(f)}
              <SourceChip source={sourceOf(input, f)} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** "From your report": the period, the counts, and whether our model matched the payout (6.3). */
function ReportCard({ link }: { link: NonNullable<ProductSummary['report']> }) {
  const { t, lang } = useI18n()
  const stats = toEngineStats(link.row)
  const fmt = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' })
  const { periodFrom, periodTo } = link.report
  const period =
    periodFrom && periodTo
      ? `${fmt.format(new Date(`${periodFrom}T00:00:00`))} – ${fmt.format(new Date(`${periodTo}T00:00:00`))}`
      : link.report.fileName
  return (
    <Card tone="lilac" className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-ink">{t('detail.reportTitle')}</h2>
      {link.report.synthetic ? <SampleBanner /> : null}
      <p className="text-base text-body">
        {t('detail.reportLine', { period, orders: link.row.orders, rto: pct(stats.rtoRate, 0), returns: pct(stats.returnRate, 0) })}
      </p>
      <ReconciliationNote rec={link.reconciliation} lowData={stats.lowData} />
    </Card>
  )
}
