import { useMemo, useState } from 'react'

import { SYNTHETIC_LABEL, categories } from '../data'
import { nearestMedian, percentileOf } from '../engine/band'
import { profitPer100Dispatched } from '../engine/floor'
import { inr, pct, signedInr } from '../engine/format'
import {
  STAGES,
  recommendAllStages,
  verdictFor,
  type Stage,
} from '../engine/recommend'
import { BandChart } from '../components/BandChart'
import { Card, CardTitle } from '../components/Card'
import { NumberField, SelectField } from '../components/Field'
import { NotViableCard } from '../components/NotViableCard'
import { ShowWorking } from '../components/ShowWorking'
import { SourceTag } from '../components/SourceTag'
import { StageCard } from '../components/StageCard'
import { VerdictBadge } from '../components/VerdictBadge'
import { useI18n } from '../i18n'
import { useProduct } from '../state/productInputs'

/**
 * Screen 2 — Bazaar Ka Daam (spec section 9.3).
 *
 * Screen 1 answers "what does this cost me?". This one puts that floor on the
 * same ruler as the market, so the seller can see the two facts that matter at
 * once: where the money starts, and where the buyers are.
 */
export function MarketBand() {
  const { inputs, set, changeCategory, category, range, band, floorInput, returnRates, monthRow, season } =
    useProduct()
  const { t, lang } = useI18n()
  const [stage, setStage] = useState<Stage>('LAUNCH')

  const recommendations = useMemo(
    () =>
      recommendAllStages(range, band, {
        currentPrice: inputs.plannedPrice ?? undefined,
        stockCoverWeeks: 8,
        weeksInStage: 4,
        competitorUndercut: false,
      }),
    [range, band, inputs.plannedPrice],
  )

  // The slider and Screen 1's "planned price" are the same value: spec section
  // 9.3 carries the inputs over, so there must not be two prices in play.
  const price = inputs.plannedPrice ?? recommendations.LAUNCH.price

  const verdict = useMemo(
    () => verdictFor({ price, input: floorInput, range, band, returnRates }),
    [price, floorInput, range, band, returnRates],
  )

  const perSale = price - range.expected
  const per100 = profitPer100Dispatched(price, range.results.expected)
  const percentile = percentileOf(band, price)
  const nearMedian = nearestMedian(band, price)

  // An unreachable floor (every order returned) is Infinity, which would make
  // the slider's max attribute literally "Infinity" and break the control.
  const safeLow = Number.isFinite(range.low) ? range.low : band.min
  const safeHigh = Number.isFinite(range.high) ? range.high : band.max
  const sliderMin = Math.max(1, Math.floor(Math.min(band.min, safeLow) * 0.75))
  const sliderMax = Math.ceil(Math.max(band.max, safeHigh) * 1.15)
  const sliderValue = Number.isFinite(price)
    ? Math.min(sliderMax, Math.max(sliderMin, price))
    : sliderMin

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-plum sm:text-3xl">
          {t('nav.band')}{' '}
          <span className="text-base font-medium text-body/60">· {t('nav.bandSub')}</span>
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-body">
          Your floor and the market on one ruler. Everything to the left of the magenta line loses
          money on every order — however many sellers are listed there.
        </p>
      </div>

      {/* ------------------------------------------------------- the band chart */}
      <Card tone="white">
        <CardTitle
          hint={
            <>
              {SYNTHETIC_LABEL}{' '}
              <span className="text-body/50">
                {lang === 'hi' ? monthRow.label_hi : monthRow.label_en}
                {season === 1 ? ` (${t('label.baseline')})` : ` — RTO ×${season}`}
              </span>
            </>
          }
          aside={<VerdictBadge verdict={verdict.verdict} size="lg" />}
        >
          {lang === 'hi' ? category.name_hi : category.name_en} — {band.count}
        </CardTitle>

        <BandChart band={band} range={range} price={price} />
      </Card>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {/* -------------------------------------------------- price + the product */}
        <div className="space-y-4">
          <Card tone="lilac">
            <CardTitle tone="lilac" hint="Drag the price across the floor line and watch the verdict change.">
              {t('label.yourPrice')}
            </CardTitle>

            <div className="flex items-baseline justify-between gap-3">
              <span className="text-4xl font-bold leading-none tabular-nums text-orange">
                {inr(price)}
              </span>
              <span className="text-right text-[11px] leading-snug text-body/70">
                {Math.round(percentile)}th percentile
                <br />
                of the market
              </span>
            </div>

            <input
              type="range"
              aria-label="Your price"
              value={sliderValue}
              min={sliderMin}
              max={sliderMax}
              step={1}
              onChange={(e) => set('plannedPrice', Number(e.target.value))}
              className="mt-3 h-5 w-full cursor-pointer accent-orange"
            />
            <div className="flex justify-between text-[10px] text-body/50">
              <span>{inr(sliderMin)}</span>
              <span className="text-magenta">
                {t('label.floor')} {inr(range.expected)}
              </span>
              <span>{inr(sliderMax)}</span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => set('plannedPrice', recommendations[stage].price)}
                className="rounded-lg bg-plum px-3 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-plum-deep"
              >
                {t('btn.useStagePrice', { stage: t(`stage.${stage}`).toLowerCase() })}
              </button>
              <button
                type="button"
                onClick={() => set('plannedPrice', Math.round(band.p50))}
                className="rounded-lg bg-white px-3 py-2 text-[11px] font-semibold text-plum transition-colors hover:bg-white/70"
              >
                {t('btn.matchMedian')}
              </button>
            </div>

            <p
              className={`mt-3 rounded-lg px-3 py-2 text-xs leading-relaxed ${
                verdict.verdict === 'HEALTHY' ? 'bg-profit/10 text-body' : 'bg-magenta/10 text-body'
              }`}
            >
              {verdict.detail}
            </p>
          </Card>

          <Card tone="peach">
            <CardTitle tone="peach" hint="Carried from Aapki Laagat. Change either and both screens follow.">
              This product
            </CardTitle>
            <div className="space-y-3">
              <SelectField
                label={t('label.category')}
                provider="seller"
                value={inputs.categoryId}
                onChange={changeCategory}
                options={categories.map((c) => ({
                  value: c.id,
                  label: lang === 'hi' ? c.name_hi : c.name_en,
                }))}
              />
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label={t('label.cogs')}
                  provider="seller"
                  value={inputs.cogs}
                  onChange={(v) => set('cogs', v)}
                  min={0}
                  step={5}
                  prefix="₹"
                />
                <NumberField
                  label={t('label.weight')}
                  provider="seller"
                  value={inputs.weightG}
                  onChange={(v) => set('weightG', v)}
                  min={0}
                  step={50}
                  suffix="g"
                />
              </div>
              <div className="rounded-lg bg-white/70 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs font-medium text-plum-deep">
                    {t('label.floor')}
                    <SourceTag provider="meesho" />
                  </span>
                  <span className="text-sm font-bold tabular-nums text-magenta">
                    {inr(range.expected)}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-body/60">
                  {inr(range.low)} – {inr(range.high)} across your return-rate range.
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* ---------------------------------------------- live numbers + stages */}
        <div className="space-y-4">
          <Card tone="white">
            <CardTitle hint={`Everything below is at ${inr(price)}.`} aside={<VerdictBadge verdict={verdict.verdict} />}>
              At this price
            </CardTitle>

            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                {
                  label: t('label.perSale'),
                  value: signedInr(perSale),
                  tone: perSale >= 0 ? 'text-profit' : 'text-magenta',
                  steps: [
                    {
                      label: 'Price minus your floor',
                      formula: `${inr(price)} − ${inr(range.expected, 2)}`,
                      value: signedInr(perSale, 2),
                      emphasis: true,
                    },
                    {
                      label: 'At your low return rate',
                      formula: `${inr(price)} − ${inr(range.low, 2)}`,
                      value: signedInr(price - range.low, 2),
                    },
                    {
                      label: 'At your high return rate',
                      formula: `${inr(price)} − ${inr(range.high, 2)}`,
                      value: signedInr(price - range.high, 2),
                    },
                  ],
                },
                {
                  label: t('label.per100'),
                  value: signedInr(per100),
                  tone: per100 >= 0 ? 'text-profit' : 'text-magenta',
                  steps: [
                    {
                      label: 'Clean sales out of 100 dispatched',
                      value: range.results.expected.cleanSales.toFixed(1),
                    },
                    {
                      label: 'Times what each one clears',
                      formula: `${range.results.expected.cleanSales.toFixed(1)} × ${signedInr(perSale, 2)}`,
                      value: signedInr(per100),
                      emphasis: true,
                    },
                    {
                      label: 'Why it is not 100 × the margin',
                      note: 'You paid shipping, packaging and COD handling on all 100 orders, but only the clean sales earn anything back.',
                    },
                  ],
                },
                {
                  label: t('label.margin'),
                  value: pct(verdict.marginPct),
                  tone: verdict.marginPct >= 0.1 ? 'text-profit' : verdict.marginPct >= 0 ? 'text-orange' : 'text-magenta',
                  steps: [
                    {
                      label: 'Profit as a share of the list price',
                      formula: `(${inr(price)} − ${inr(range.expected, 2)}) ÷ ${inr(price)}`,
                      value: pct(verdict.marginPct),
                      emphasis: true,
                    },
                    {
                      label: 'Thresholds',
                      note: 'Below 0% is a loss, 0–10% is thin, 10% and above is healthy (spec section 6.2).',
                    },
                  ],
                },
                {
                  label: t('label.percentile'),
                  value: `${Math.round(percentile)}th`,
                  tone: 'text-plum-deep',
                  steps: [
                    {
                      label: 'Where you sit among the listings',
                      formula: `${inr(price)} against ${band.count} listings from ${inr(band.min)} to ${inr(band.max)}`,
                      value: `${Math.round(percentile)}th percentile`,
                      emphasis: true,
                    },
                    {
                      label: 'Median of the five closest listings',
                      value: inr(nearMedian),
                      note: 'This is the number trigger T3 watches for a competitor undercut.',
                    },
                    {
                      label: 'Visibility',
                      note: 'Buyers mostly see the cheaper end of the band, so a high percentile costs impressions.',
                    },
                  ],
                },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg bg-lilac/70 px-3 py-2">
                  <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase leading-tight tracking-wide text-body/60">
                    {stat.label}
                    <ShowWorking title={stat.label.toLowerCase()} steps={stat.steps} />
                  </dt>
                  <dd className={`mt-1 text-xl font-bold tabular-nums ${stat.tone}`}>{stat.value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {verdict.verdict === 'NOT_VIABLE' ? (
            <NotViableCard verdict={verdict} range={range} band={band} />
          ) : null}

          <Card tone="white">
            <CardTitle hint="What to list at as the product moves through its life. Tap one to make it the active stage.">
              Price by lifecycle stage
            </CardTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              {STAGES.map((s) => (
                <StageCard
                  key={s}
                  recommendation={recommendations[s]}
                  range={range}
                  active={stage === s}
                  onSelect={setStage}
                />
              ))}
            </div>
          </Card>

          <Card tone="lilac">
            <p className="text-xs leading-relaxed text-body">
              <span className="font-semibold text-plum">About this band.</span> {SYNTHETIC_LABEL} The
              recommendation never depends on price-vs-sales history, because a new listing has
              none: it starts from your floor and this band only, then learns your product&rsquo;s
              price sensitivity from your own ₹10–20 steps during the ramp stage.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
