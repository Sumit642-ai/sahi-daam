import { useMemo } from 'react'

import { categories } from '../data'
import { inr, pct, signedInr } from '../engine/format'
import {
  STAGES,

  recommendAllStages,
  verdictFor,
  type Stage,
} from '../engine/recommend'
import { TRIGGER_IDS } from '../engine/triggers'
import { useI18n } from '../i18n'
import { Card, CardTitle } from '../components/Card'
import { NumberField, SelectField } from '../components/Field'
import { ShowWorking } from '../components/ShowWorking'
import { VerdictBadge } from '../components/VerdictBadge'
import { useProduct } from '../state/productInputs'

/**
 * Screen 5 — Meesho today vs Sahi Daam (spec section 9.6).
 *
 * The same product, side by side. Meesho's Recommended Price Range is a real
 * and useful tool; the point of this screen is not that it is wrong but that it
 * answers only half the question, and the half it leaves out is the half that
 * decides whether the seller makes money.
 */
interface ComparisonProps {
  onOpenBand: () => void
}

/** What today's tool knows, and what it does not. */
const CHECKLIST: { key: string; meesho: boolean }[] = [
  { key: 'compare.check.competitors', meesho: true },
  { key: 'compare.check.demand', meesho: true },
  { key: 'compare.check.cost', meesho: false },
  { key: 'compare.check.rto', meesho: false },
  { key: 'compare.check.stage', meesho: false },
  { key: 'compare.check.alerts', meesho: false },
]

function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
        on ? 'bg-profit/15 text-profit' : 'bg-magenta/10 text-magenta'
      }`}
    >
      {on ? '✓' : '✗'}
    </span>
  )
}

export function MeeshoComparison({ onOpenBand }: ComparisonProps) {
  const { t, lang } = useI18n()
  const { inputs, set, changeCategory, category, range, band, floorInput, returnRates } =
    useProduct()

  // What Meesho's Recommended Price Range would say today: the middle half of
  // the market, which is exactly the p25-p75 of the same band.
  const meeshoLow = Math.round(band.p25)
  const meeshoHigh = Math.round(band.p75)
  const meeshoMid = Math.round((band.p25 + band.p75) / 2)

  const verdictAt = useMemo(
    () => (price: number) => verdictFor({ price, input: floorInput, range, band, returnRates }),
    [floorInput, range, band, returnRates],
  )

  const recommendations = useMemo(
    () => recommendAllStages(range, band, { currentPrice: inputs.plannedPrice ?? undefined }),
    [range, band, inputs.plannedPrice],
  )

  const points: { labelKey: 'compare.atBottom' | 'compare.atMidpoint' | 'compare.atTop'; price: number }[] = [
    { labelKey: 'compare.atBottom', price: meeshoLow },
    { labelKey: 'compare.atMidpoint', price: meeshoMid },
    { labelKey: 'compare.atTop', price: meeshoHigh },
  ]

  const midVerdict = verdictAt(meeshoMid)

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-plum sm:text-3xl">
          {t('compare.title')}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-body">{t('compare.lead')}</p>
      </div>

      {/* ---------------------------------------------------------- the product */}
      <Card tone="lilac">
        <div className="grid gap-3 sm:grid-cols-3">
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
      </Card>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        {/* ------------------------------------------------------ Meesho today */}
        <Card tone="white">
          <CardTitle hint={lang === 'hi' ? category.name_hi : category.name_en}>
            {t('compare.today')}
          </CardTitle>

          <div className="rounded-card bg-lilac p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-body/70">
              {t('compare.todayRange', { from: inr(meeshoLow), to: inr(meeshoHigh) })}
            </p>
            <p className="mt-2 text-4xl font-bold leading-none tracking-tight text-plum">
              {inr(meeshoLow)} <span className="text-plum/40">–</span> {inr(meeshoHigh)}
            </p>
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-plum">
            {t('compare.knows')}
          </p>
          <ul className="mt-2 space-y-1.5">
            {CHECKLIST.map((row) => (
              <li
                key={row.key}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                  row.meesho ? 'bg-lilac/60' : 'bg-magenta/[0.06]'
                }`}
              >
                <Tick on={row.meesho} />
                <span
                  className={`text-xs ${row.meesho ? 'text-body' : 'font-medium text-magenta'}`}
                >
                  {t(row.key as 'compare.check.cost')}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {/* ------------------------------------------------------ With Sahi Daam */}
        <Card tone="peach">
          <CardTitle tone="peach" hint={lang === 'hi' ? category.name_hi : category.name_en}>
            {t('compare.withSahi')}
          </CardTitle>

          <div className="rounded-card bg-plum p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
              {t('label.floor')}
            </p>
            <p className="mt-2 text-4xl font-bold leading-none tracking-tight text-orange">
              {inr(range.low)} <span className="text-white/40">–</span> {inr(range.high)}
            </p>
            <p className="mt-1 text-sm text-white/80">
              {t('label.mostLikely')}{' '}
              <span className="font-bold text-white">{inr(range.expected)}</span>
            </p>
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-plum">
            {t('compare.knows')}
          </p>
          <ul className="mt-2 space-y-1.5">
            {CHECKLIST.map((row) => (
              <li key={row.key} className="flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2">
                <Tick on />
                <span className="text-xs text-body">{t(row.key as 'compare.check.cost')}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* ------------------------------------- what Meesho's range actually earns */}
      <Card tone="white" className="mt-4">
        <CardTitle
          hint={t('compare.todayRange', { from: inr(meeshoLow), to: inr(meeshoHigh) })}
          aside={<VerdictBadge verdict={midVerdict.verdict} size="lg" />}
        >
          {t('compare.gapTitle')}
        </CardTitle>

        <div className="grid gap-3 sm:grid-cols-3">
          {points.map((point) => {
            const verdict = verdictAt(point.price)
            const perSale = point.price - range.expected
            return (
              <div
                key={point.labelKey}
                className={`rounded-card p-4 ${perSale < 0 ? 'bg-magenta/10' : 'bg-lilac/70'}`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-body/60">
                  {t(point.labelKey)}
                </p>
                <p className="mt-1 text-2xl font-bold leading-none text-plum-deep">
                  {inr(point.price)}
                </p>
                <p
                  className={`mt-2 text-xl font-bold leading-none ${
                    perSale < 0 ? 'text-magenta' : 'text-profit'
                  }`}
                >
                  {signedInr(perSale)}
                </p>
                <p className="mt-1 text-[11px] text-body/70">
                  {t('label.perSale')} · {t('label.margin')} {pct(verdict.marginPct)}
                </p>
                <VerdictBadge verdict={verdict.verdict} className="mt-2" />
                <ShowWorking
                  className="mt-2"
                  title={t('label.perSale').toLowerCase()}
                  steps={[
                    { label: t('compare.todayRange', { from: inr(meeshoLow), to: inr(meeshoHigh) }) },
                    {
                      label: t('label.floor'),
                      value: inr(range.expected, 2),
                    },
                    {
                      label: t('label.perSale'),
                      formula: `${inr(point.price)} − ${inr(range.expected, 2)}`,
                      value: signedInr(perSale, 2),
                      emphasis: true,
                    },
                    {
                      label: t('label.per100'),
                      value: signedInr(range.results.expected.cleanSales * perSale),
                    },
                  ]}
                />
              </div>
            )
          })}
        </div>
      </Card>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        {/* ----------------------------------------------------- stage prices */}
        <Card tone="white">
          <CardTitle hint={t('compare.check.stage')}>{t('compare.stageHeading')}</CardTitle>
          <ul className="space-y-1.5">
            {STAGES.map((stage: Stage) => (
              <li
                key={stage}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg bg-lilac/60 px-3 py-2"
              >
                <span>
                  <span className="text-xs font-semibold text-plum">{t(`stage.${stage}`)}</span>
                  <span className="ml-2 text-[11px] text-body/60">
                    {t(`stage.${stage}.aim`)}
                  </span>
                </span>
                <span className="text-sm font-bold tabular-nums text-orange">
                  {inr(recommendations[stage].price)}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onOpenBand}
            className="mt-3 w-full rounded-lg bg-plum px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-plum-deep"
          >
            {t('btn.openBand')} →
          </button>
        </Card>

        {/* --------------------------------------------------------- watching */}
        <Card tone="lilac">
          <CardTitle tone="lilac" hint={t('compare.watchBody')}>
            {t('compare.watchHeading')}
          </CardTitle>
          <ul className="grid grid-cols-2 gap-1.5">
            {TRIGGER_IDS.map((id) => (
              <li key={id} className="rounded-lg bg-white/70 px-2 py-1.5 text-center">
                <span className="text-[11px] font-bold text-plum">{id}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-snug text-body/70">{t('compare.noAlerts')}</p>
        </Card>
      </div>
    </div>
  )
}
