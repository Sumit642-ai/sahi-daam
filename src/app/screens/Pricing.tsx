/**
 * Price helper (spec v2, 7.6) and sale check (7.7): one product, one answer
 * per screen. Both read the same ProductModel as the floor card.
 *
 * The guardrail (hard rule 3) lives in the engine: nothing here can show a
 * recommended price below the floor.
 */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { inr, pct } from '../../engine/format'
import { keepPerSale } from '../../engine/keep'
import {
  MAX_PRICES,
  STAGES,
  type Stage,
  notViable,
  notViableFixes,
  visibilityWarning,
} from '../../engine/priceHelper'
import { DEFAULT_SALE_DISCOUNT, type SaleLiftResult, saleLiftCheck } from '../../engine/saleLift'
import { type MessageKey, useI18n, useT } from '../../i18n'
import { useBack } from '../hooks'
import { parseAmount } from '../lib/validate'
import { type ProductModel, useProductModel } from '../productModel'
import { addCompetitorPrice, removeCompetitorPrice, setPrice, setStageOverride, startPriceStep, undoPrice, undoPriceStep } from '../repo'
import { track } from '../telemetry'
import { useToast } from '../toast'
import { BackButton, Button, Card, Choice, LoadingPage, PageTitle, STATUS_TEXT, buttonClass } from '../ui'
import { ProductNotFound } from './ProductDetail'

function useModel(): { model: ProductModel | null | undefined; back: () => void } {
  const { id } = useParams()
  return { model: useProductModel(id), back: useBack(id ? `/products/${id}` : '/products') }
}

function Header({ model, back, title }: { model: ProductModel; back: () => void; title: string }) {
  const t = useT()
  const { summary } = model
  return (
    <div className="flex flex-col gap-1">
      <div>
        <BackButton onClick={back} />
      </div>
      <PageTitle>{title}</PageTitle>
      <p className="break-words text-base text-body">
        {model.product.name} · {t('price.nowLine', { price: inr(summary.input.price), floor: inr(summary.result.floor) })}
      </p>
    </div>
  )
}

// --------------------------------------------------------- price helper

export function PriceHelper() {
  const { t } = useI18n()
  const toast = useToast()
  const { model, back } = useModel()
  const [draft, setDraft] = useState('')
  const [draftError, setDraftError] = useState<MessageKey | null>(null)

  if (model === undefined) return <LoadingPage />
  if (model === null) return <ProductNotFound onBack={back} />

  const { product, summary, market: m, range, competitorPrices, stage, autoStage } = model
  const floor = summary.result.floor
  const reliable = m?.reliable ?? false
  const outliers = new Set(m?.outliers ?? [])
  const notViableHere = summary.result.viable && notViable(floor, m)
  const keepAtTarget = range.viable ? keepPerSale({ ...summary.input, price: range.target }).keep : Number.NaN
  const warnFor = [range.target, summary.input.price].find((p) => Number.isFinite(p) && visibilityWarning(p, m))

  const add = () => {
    const n = parseAmount(draft)
    if (n === null) return
    if (Number.isNaN(n) || n <= 0) return setDraftError('error.mustBePositive')
    setDraftError(null)
    setDraft('')
    void addCompetitorPrice(product.id, Math.round(n), MAX_PRICES).then((ok) => {
      if (!ok) setDraftError('price.tooMany')
    })
  }
  const removeAt = (i: number) => void removeCompetitorPrice(product.id, i)

  // A Growing step is a price step to judge (spec 7.9); any other stage just sets the price.
  const isStep = stage === 'GROWING' && !range.waitingOnStep && !range.lifted && range.target > summary.input.price
  const usePrice = async () => {
    void track('price_applied', { step: isStep })
    if (isStep) {
      const started = await startPriceStep(product.id, range.target)
      toast({ message: t('price.tryDone', { price: inr(range.target) }), onUndo: () => void undoPriceStep(started) })
    } else {
      const change = await setPrice(product.id, range.target)
      toast({ message: t('price.applied', { price: inr(range.target) }), onUndo: () => void undoPrice(change) })
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Header model={model} back={back} title={t('price.title')} />

      <Card>
        <h2 className="text-lg font-semibold text-ink">{t('price.marketTitle')}</h2>
        <p className="mt-1 text-sm text-body/80">{t('price.marketHint')}</p>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <label htmlFor="competitor-price" className="sr-only">
            {t('price.addLabel')}
          </label>
          <input
            id="competitor-price"
            inputMode="decimal"
            value={draft}
            placeholder="₹"
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-tap w-full min-w-0 flex-1 rounded-xl border-2 border-plum/20 px-3 text-base focus:outline-none focus:ring-2 focus:ring-orange"
          />
          <button type="submit" className={buttonClass('secondary', 'shrink-0')} disabled={competitorPrices.length >= MAX_PRICES}>
            {t('price.add')}
          </button>
        </form>
        {draftError ? <p className="mt-1 text-sm font-medium text-loss">{t(draftError)}</p> : null}
        {competitorPrices.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label={t('price.marketTitle')}>
            {competitorPrices.map((p, i) => (
              <li key={`${i}-${p}`}>
                <span
                  className={`inline-flex min-h-tap items-center gap-1 rounded-full border-2 pl-3 text-base font-semibold ${
                    outliers.has(i) ? 'border-thin bg-peach text-thin' : 'border-plum/20 bg-white text-ink'
                  }`}
                >
                  {inr(p)}
                  {outliers.has(i) ? <span className="text-xs font-semibold">{t('price.outlier')}</span> : null}
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    aria-label={t('price.remove', { price: inr(p) })}
                    className="inline-flex min-h-tap min-w-tap items-center justify-center rounded-full text-lg text-muted hover:text-loss"
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-2 text-sm text-muted">{t('price.count', { n: competitorPrices.length, max: MAX_PRICES })}</p>
      </Card>

      <Card>
        <Choice<Stage>
          legend={t('price.stageTitle')}
          hint={product.stageOverride ? t('price.stageManual', { auto: t(`stage.${autoStage}` as MessageKey) }) : t('price.stageAuto')}
          columns={2}
          value={stage}
          onChange={(s) => void setStageOverride(product.id, s === autoStage ? null : s)}
          options={STAGES.map((s) => ({ value: s, label: t(`stage.${s}` as MessageKey) }))}
        />
        {product.stageOverride ? (
          <Button variant="ghost" className="mt-2" onClick={() => void setStageOverride(product.id, null)}>
            {t('price.useAuto')}
          </Button>
        ) : null}
      </Card>

      {notViableHere ? <NotViableCard model={model} /> : null}

      {range.viable ? (
        <Card tone="lilac" className={`flex flex-col gap-2 ${reliable ? '' : 'opacity-70'}`}>
          <p className="text-sm font-semibold uppercase tracking-wide text-plum">{t(`stage.${stage}` as MessageKey)}</p>
          <p className="text-3xl font-bold text-ink md:text-4xl">
            {range.low === range.high ? inr(range.low) : `${inr(range.low)} – ${inr(range.high)}`}
          </p>
          <p className="text-base text-body">{t(`stage.${stage}.aim` as MessageKey)}</p>
          {!reliable ? <p className="text-base font-medium text-thin">{t('price.needThree')}</p> : null}
          {stage === 'CLEARING' && range.ladder.length > 0 ? (
            <p className="text-base text-body">{t('price.ladder', { steps: range.ladder.map((p) => inr(p)).join(' → ') })}</p>
          ) : null}
          {range.lifted ? <p className="text-base text-body">{t('price.lifted', { floor: inr(floor) })}</p> : null}
          {range.waitingOnStep ? <p className="text-base font-medium text-plum">{t('price.waitStep')}</p> : null}
          {warnFor !== undefined ? (
            <p role="note" className="rounded-xl bg-peach p-3 text-base text-thin">
              {t('price.visibility')}
            </p>
          ) : null}
          <p className={`text-lg font-semibold ${keepAtTarget >= 0 ? 'text-healthy' : 'text-loss'}`}>
            {t('detail.keepHeadline', { price: inr(range.target), keep: inr(keepAtTarget) })}
          </p>
          <Button className="mt-1 w-full sm:w-auto" disabled={Math.round(range.target) === Math.round(summary.input.price)} onClick={() => void usePrice()}>
            {isStep ? t('price.try', { price: inr(range.target) }) : t('price.use', { price: inr(range.target) })}
          </Button>
        </Card>
      ) : (
        <Card>
          <p className="text-base">{t('detail.noFloor')}</p>
        </Card>
      )}
    </div>
  )
}

function NotViableCard({ model }: { model: ProductModel }) {
  const t = useT()
  const { summary, product } = model
  const fixes = notViableFixes(summary.input, product.weightG)
  const text = (id: string, d: Record<string, number>, floor: number) => {
    switch (id) {
      case 'prepaid':
        return t('fix.prepaid', { from: pct(d.rtoFrom!, 0), to: pct(d.rtoTo!, 0), floor: inr(floor) })
      case 'lighter':
        return d.targetG !== undefined
          ? t('fix.lighterSlab', { grams: d.shedG!, target: d.targetG, floor: inr(floor) })
          : t('fix.lighterPack', { from: inr(d.packagingFrom!), to: inr(d.packagingTo!), floor: inr(floor) })
      case 'bundle':
        return t('fix.bundle', { pair: inr(d.pairPrice!), floor: inr(floor) })
      default:
        return t('fix.cost', { cost: inr(d.costTo!), floor: inr(floor) })
    }
  }
  return (
    <Card tone="peach" className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-loss">{t('price.notViableTitle')}</h2>
      <p className="text-base text-body">{t('price.notViable', { floor: inr(summary.result.floor) })}</p>
      <ul className="flex flex-col gap-2">
        {fixes.map((f) => (
          <li key={f.id} className="rounded-xl bg-white p-3 text-base text-ink">
            {text(f.id, f.detail, f.floor)}
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ----------------------------------------------------------- sale check

const PRESETS = [10, 20, 30, 40, 50]

export function SaleCheck() {
  const { t } = useI18n()
  const { model, back } = useModel()
  const [discount, setDiscount] = useState(String(DEFAULT_SALE_DISCOUNT * 100))
  const [guess, setGuess] = useState('')
  // Counted once a day per device (section 10).
  useEffect(() => void track('sale_check_used'), [])

  if (model === undefined) return <LoadingPage />
  if (model === null) return <ProductNotFound onBack={back} />

  const d = parseAmount(discount)
  const g = parseAmount(guess)
  const validDiscount = d !== null && !Number.isNaN(d) && d > 0 && d < 100
  const validGuess = g !== null && !Number.isNaN(g) && g >= 0
  const check = validDiscount
    ? saleLiftCheck({ input: model.summary.input, discount: d / 100, sellerGuessLift: validGuess ? g / 100 : undefined })
    : null

  return (
    <div className="flex flex-col gap-5">
      <Header model={model} back={back} title={t('sale.title')} />

      <Card className="flex flex-col gap-4">
        <div>
          <p className="mb-2 text-lg font-semibold text-ink">{t('sale.discount')}</p>
          <div role="group" aria-label={t('sale.discount')} className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={d === p}
                onClick={() => setDiscount(String(p))}
                className={`min-h-tap min-w-tap rounded-full border-2 px-4 text-base font-semibold ${
                  d === p ? 'border-plum bg-plum text-white' : 'border-plum/20 text-plum hover:bg-lilac'
                }`}
              >
                {p}%
              </button>
            ))}
          </div>
          <label className="mt-3 flex flex-col gap-1">
            <span className="text-base text-body">{t('sale.discountOther')}</span>
            <input
              inputMode="decimal"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              aria-invalid={!validDiscount || undefined}
              className={`min-h-tap w-32 rounded-xl border-2 px-3 text-base focus:outline-none focus:ring-2 focus:ring-orange ${validDiscount ? 'border-plum/20' : 'border-loss'}`}
            />
          </label>
          {!validDiscount ? <p className="mt-1 text-sm font-medium text-loss">{t('sale.discountError')}</p> : null}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-base text-body">
            {t('sale.guess')} <span className="text-sm text-muted">({t('common.optional')})</span>
          </span>
          <input
            inputMode="decimal"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            className="min-h-tap w-32 rounded-xl border-2 border-plum/20 px-3 text-base focus:outline-none focus:ring-2 focus:ring-orange"
          />
        </label>
      </Card>

      {check ? <SaleResult model={model} check={check} /> : null}
    </div>
  )
}

const VERDICT_TONE: Record<SaleLiftResult['verdict'], string> = {
  JOIN: 'border-healthy text-healthy',
  JOIN_WITH_PREPAID: 'border-thin text-thin',
  SKIP_LOSS: 'border-loss text-loss',
  SKIP_LIFT: 'border-loss text-loss',
  FIX_PRICE_FIRST: 'border-loss text-loss',
}

export function verdictText(t: (k: MessageKey, v?: Record<string, string | number>) => string, check: SaleLiftResult): string {
  switch (check.verdict) {
    case 'JOIN':
      return t('sale.verdict.JOIN')
    case 'JOIN_WITH_PREPAID':
      return t('sale.verdict.JOIN_WITH_PREPAID')
    case 'SKIP_LOSS':
      return t('sale.verdict.SKIP_LOSS', { loss: inr(check.lossPerSaleOrder) })
    case 'SKIP_LIFT':
      return t('sale.verdict.SKIP_LIFT', { lift: pct(check.plain.lift ?? 0, 0) })
    case 'FIX_PRICE_FIRST':
      return t('sale.verdict.FIX_PRICE_FIRST')
  }
}

function SaleResult({ model, check }: { model: ProductModel; check: SaleLiftResult }) {
  const t = useT()
  const { product, summary } = model
  const verdict = verdictText(t, check)

  if (check.verdict === 'FIX_PRICE_FIRST') {
    return (
      <Card className={`flex flex-col gap-2 border-2 ${VERDICT_TONE.FIX_PRICE_FIRST}`}>
        <p className="text-2xl font-bold">{verdict}</p>
        <p className="text-base text-body">
          {t('detail.loseHeadline', { price: inr(summary.input.price), loss: inr(-check.plain.now.keep) })}
        </p>
        <Link to={`/products/${product.id}/price`} className={buttonClass('primary', 'self-start')}>
          {t('price.open')}
        </Link>
      </Card>
    )
  }

  const side = (keep: number, lift: number | null) => (
    <>
      <p className={`text-lg font-semibold ${keep >= 0 ? STATUS_TEXT.HEALTHY : STATUS_TEXT.LOSS}`}>
        {keep >= 0
          ? t('sale.keepAtSale', { price: inr(check.salePrice), keep: inr(keep) })
          : t('sale.loseAtSale', { price: inr(check.salePrice), loss: inr(-keep) })}
      </p>
      {lift !== null ? <p className="text-base text-ink">{t('sale.lift', { lift: pct(lift, 0) })}</p> : null}
    </>
  )

  const share = `https://wa.me/?text=${encodeURIComponent(
    t('sale.shareText', {
      product: product.name,
      discount: pct(check.discount, 0),
      verdict,
      price: inr(check.salePrice),
    }),
  )}`

  return (
    <div className="flex flex-col gap-4">
      <Card className={`border-2 ${VERDICT_TONE[check.verdict]}`}>
        <p className="text-2xl font-bold">{verdict}</p>
      </Card>
      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-ink">{t('sale.atPrice', { price: inr(check.salePrice), discount: pct(check.discount, 0) })}</h2>
        {side(check.plain.atSale.keep, check.plain.lift)}
      </Card>
      <Card tone="lilac" className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-ink">{t('sale.withPrepaid')}</h2>
        {side(check.withPrepaid.atSale.keep, check.withPrepaid.lift)}
        <p className="text-sm text-muted">{t('sale.prepaidNote')}</p>
      </Card>
      <a href={share} target="_blank" rel="noreferrer" onClick={() => void track('share_clicked', { kind: 'SALE' })} className={buttonClass('secondary', 'self-start')}>
        {t('sale.share')}
      </a>
    </div>
  )
}
