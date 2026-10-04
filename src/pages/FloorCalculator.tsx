import { useState } from 'react'

import { categories } from '../data'
import { inr, pct } from '../engine/format'
import { BASELINE_MONTH } from '../engine/season'
import { useI18n } from '../i18n'
import { Card, CardTitle } from '../components/Card'
import { CostTable } from '../components/CostTable'
import { NumberField, ReadOnlyField, SelectField, SliderField } from '../components/Field'
import { FloorHeadline } from '../components/FloorHeadline'
import { Funnel } from '../components/Funnel'
import { OverheadBars } from '../components/OverheadBars'
import { ProfitStatPair } from '../components/ProfitStatPair'
import { ShowWorking } from '../components/ShowWorking'
import type { Provider } from '../components/SourceTag'
import { useProduct } from '../state/productInputs'

/**
 * Screen 1 — Aapki Laagat.
 *
 * Inputs on the left, each tagged with who provides it. Outputs on the right,
 * each expandable to its working. Nothing is hidden: the auto-filled values are
 * all editable through the Advanced drawer, and the what-if sliders move the
 * same state the drawer does, so there is only ever one source of truth.
 */

type Scenario = 'low' | 'expected' | 'high'

/** A 0–1 share, edited as a percentage. */
function PercentField({
  label,
  value,
  onChange,
  provider = 'meesho',
  max = 100,
  hint,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  provider?: Provider
  max?: number
  hint?: React.ReactNode
}) {
  return (
    <NumberField
      label={label}
      provider={provider}
      value={Math.round(value * 1000) / 10}
      onChange={(v) => onChange(Math.min(max, Math.max(0, v ?? 0)) / 100)}
      min={0}
      max={max}
      step={0.5}
      suffix="%"
      hint={hint}
    />
  )
}

export function FloorCalculator() {
  const {
    inputs: draft,
    set,
    update,
    changeCategory,
    resetToDefaults,
    category,
    months,
    monthRow,
    season: index,
    range,
    costToServe,
    slab,
    deck,
    tagFor,
    sources,
  } = useProduct()

  const { t, lang } = useI18n()
  const [scenario, setScenario] = useState<Scenario>('expected')
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const active = range.results[scenario]
  const srcReturnRate = sources.returnRate
  const srcWriteOff = sources.writeOff
  const srcPackaging = sources.packaging

  const scenarioTabs: { key: Scenario; label: string; rate: number }[] = [
    { key: 'low', label: t('label.low'), rate: draft.returnRateLow },
    { key: 'expected', label: t('label.mostLikely'), rate: draft.returnRateExpected },
    { key: 'high', label: t('label.high'), rate: draft.returnRateHigh },
  ]

  /** Keeps low ≤ expected ≤ high while the slider drags the whole range. */
  const setExpectedReturnRate = (next: number) => {
    const delta = next - draft.returnRateExpected
    update({
      returnRateExpected: next,
      returnRateLow: Math.max(0, Math.min(next, draft.returnRateLow + delta)),
      returnRateHigh: Math.min(1, Math.max(next, draft.returnRateHigh + delta)),
    })
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-plum sm:text-3xl">
          {t('nav.floor')}{' '}
          <span className="text-base font-medium text-body/60">· {t('nav.floorSub')}</span>
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-body">
          {t('floor.lead')}
        </p>
      </div>

      <div className="space-y-4">
        <FloorHeadline
          range={range}
          costToServe={costToServe}
          deck={deck}
          monthLabel={monthRow.label_en}
          seasonIndex={index}
        />

        {draft.plannedPrice !== null && draft.plannedPrice > 0 ? (
          <ProfitStatPair
            price={draft.plannedPrice}
            cogs={draft.cogs ?? 0}
            range={range}
            deck={deck}
          />
        ) : (
          <Card tone="lilac">
            <p className="text-sm text-body">
              {t('floor.enterPrice')}
            </p>
          </Card>
        )}
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {/* ------------------------------------------------------------ inputs */}
        <div className="space-y-4">
          <Card tone="lilac">
            <CardTitle tone="lilac" hint={t('floor.yourProductHint')}>
              {t('floor.yourProduct')}
            </CardTitle>
            <div className="space-y-3">
              <SelectField
                label={t('label.category')}
                provider="listing"
                value={draft.categoryId}
                onChange={changeCategory}
                options={categories.map((c) => ({
                  value: c.id,
                  label: lang === 'hi' ? c.name_hi : c.name_en,
                }))}
                hint={category.rtoNote}
              />

              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label={t('label.cogs')}
                  provider="seller"
                  value={draft.cogs}
                  onChange={(v) => set('cogs', v)}
                  min={0}
                  step={5}
                  prefix="₹"
                  hint="What you pay your supplier."
                />
                <NumberField
                  label={t('label.weight')}
                  provider="listing"
                  value={draft.weightG}
                  onChange={(v) => set('weightG', v)}
                  min={0}
                  step={50}
                  suffix="g"
                  hint="Packed, as shipped."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label={t('label.plannedPrice')}
                  provider="seller"
                  value={draft.plannedPrice}
                  onChange={(v) => set('plannedPrice', v)}
                  min={0}
                  step={10}
                  prefix="₹"
                  placeholder="optional"
                  hint="What you were going to list at."
                />
                <NumberField
                  label={t('label.adSpend')}
                  provider="seller"
                  value={draft.adSpendPerOrder}
                  onChange={(v) => set('adSpendPerOrder', v)}
                  min={0}
                  step={1}
                  prefix="₹"
                  hint="Optional. Leave at ₹0."
                />
              </div>

              <SelectField
                label={t('label.month')}
                provider="seller"
                value={draft.month}
                onChange={(month) => set('month', month)}
                options={months.map((m) => ({
                  value: m.key,
                  label: `${lang === 'hi' ? m.label_hi : m.label_en} — RTO ×${m.index.toFixed(
                    m.index === 1 ? 2 : 3,
                  )}${m.key === BASELINE_MONTH ? ` (${t('label.baseline')})` : ''}`,
                }))}
                hint={monthRow.note}
              />
            </div>
          </Card>

          {/* ------------------------------------------ auto-filled by Meesho */}
          <Card tone="peach">
            <CardTitle
              tone="peach"
              hint={t('floor.meeshoFillsHint')}
            >
              {t('floor.meeshoFills')}
            </CardTitle>

            <div className="space-y-1.5">
              <ReadOnlyField
                label={t('label.shippingSlab')}
                provider={tagFor(slab.source)}
                value={`${inr(slab.forward)} / ${inr(slab.reverse)}`}
                detail={`${slab.label} — forward / reverse per order`}
                aside={
                  <ShowWorking
                    title="your shipping slab"
                    steps={[
                      {
                        label: 'Your packed weight',
                        value: `${draft.weightG ?? 0} g`,
                      },
                      {
                        label: 'Slab it falls in',
                        value: slab.label,
                        note: 'Shipping is a step function, so the cost is flat inside a slab and jumps at the boundary.',
                      },
                      {
                        label: 'Forward shipping, per order dispatched',
                        value: inr(slab.forward),
                        emphasis: true,
                      },
                      {
                        label: 'Reverse shipping, per order that comes back',
                        value: inr(slab.reverse),
                        emphasis: true,
                        note: 'Reverse costs more than forward, and you pay it on RTO orders and on returns alike.',
                      },
                    ]}
                    source={slab.source}
                  />
                }
              />

              <ReadOnlyField
                label={t('label.codShare')}
                provider="meesho"
                value={pct(draft.codShare, 0)}
                detail="Share of your orders paid cash on delivery, from your region mix."
                aside={
                  <ShowWorking
                    title="your COD share"
                    steps={[
                      {
                        label: 'Orders paid cash on delivery',
                        value: pct(draft.codShare, 0),
                        note: 'COD orders are refused at the door far more often than prepaid ones, so this single number drives most of your RTO.',
                      },
                      {
                        label: 'Orders paid up front',
                        formula: `100% − ${pct(draft.codShare, 0)}`,
                        value: pct(1 - draft.codShare, 0),
                      },
                    ]}
                    source="Valmo DICE data pack"
                  />
                }
              />

              <ReadOnlyField
                label={t('label.expectedRto')}
                provider="meesho"
                value={pct(active.rto)}
                detail={
                  index === 1
                    ? `Computed from your COD mix: ${pct(draft.rtoCod, 0)} on COD, ${pct(draft.rtoPrepaid, 0)} on prepaid.`
                    : `Baseline ${pct(draft.codShare * draft.rtoCod + (1 - draft.codShare) * draft.rtoPrepaid)} lifted ×${index} by ${monthRow.label_en}.`
                }
                aside={
                  <ShowWorking
                    title="your expected RTO"
                    steps={[
                      {
                        label: 'RTO on your COD orders',
                        value: pct(draft.rtoCod, 0),
                      },
                      {
                        label: 'RTO on your prepaid orders',
                        value: pct(draft.rtoPrepaid, 0),
                      },
                      {
                        label: 'Blended across your COD mix',
                        formula: `(${pct(draft.codShare, 0)} × ${pct(draft.rtoCod, 0)}) + (${pct(1 - draft.codShare, 0)} × ${pct(draft.rtoPrepaid, 0)})`,
                        value: pct(
                          draft.codShare * draft.rtoCod + (1 - draft.codShare) * draft.rtoPrepaid,
                        ),
                      },
                      {
                        label: `Lifted by ${monthRow.label_en}`,
                        formula: `× ${index}`,
                        value: pct(active.rto),
                        emphasis: true,
                        note:
                          index === 1
                            ? 'The baseline month, so nothing is added.'
                            : 'The season index scales your own baseline — it is not an absolute RTO.',
                      },
                    ]}
                    source="RTO rates from the Valmo DICE data pack; season index from Unicommerce via MediaBrief"
                  />
                }
              />

              <ReadOnlyField
                label={t('label.returnRate')}
                provider={tagFor(srcReturnRate)}
                value={`${pct(draft.returnRateLow, 0)} – ${pct(draft.returnRateHigh, 0)}`}
                detail={`Most likely ${pct(draft.returnRateExpected, 0)} of delivered orders, for ${category.name_en}.`}
                aside={
                  <ShowWorking
                    title="your return rate"
                    steps={[
                      { label: 'Low', value: pct(draft.returnRateLow, 0) },
                      {
                        label: 'Most likely',
                        value: pct(draft.returnRateExpected, 0),
                        emphasis: true,
                      },
                      { label: 'High', value: pct(draft.returnRateHigh, 0) },
                      {
                        label: 'What it is a share of',
                        note: 'Delivered orders, not dispatched ones. An order that never reached the buyer is an RTO, not a return.',
                      },
                    ]}
                    source={srcReturnRate}
                  />
                }
              />

              <ReadOnlyField
                label={t('label.writeOffShare')}
                provider={tagFor(srcWriteOff)}
                value={pct(draft.writeOffShare, 0)}
                detail="Returns that cannot go back on the shelf — you lose the product."
                aside={
                  <ShowWorking
                    title="the unsellable share"
                    steps={[
                      {
                        label: 'Returns that cannot be resold',
                        value: pct(draft.writeOffShare, 0),
                      },
                      {
                        label: 'What that costs you',
                        formula: `${active.writeOffUnits.toFixed(1)} units × ${inr(draft.cogs ?? 0)} COGS`,
                        value: inr(active.writeOffCost),
                        emphasis: true,
                      },
                    ]}
                    source={srcWriteOff}
                  />
                }
              />

              <ReadOnlyField
                label={t('label.packaging')}
                provider={tagFor(srcPackaging)}
                value={inr(draft.packagingCost ?? 0)}
                detail="Per order dispatched. Editable under Advanced."
                aside={
                  <ShowWorking
                    title="your packaging cost"
                    steps={[
                      {
                        label: 'Per order dispatched',
                        value: inr(draft.packagingCost ?? 0),
                      },
                      {
                        label: 'On 100 dispatched',
                        formula: `100 × ${inr(draft.packagingCost ?? 0)}`,
                        value: inr(active.packagingTotal),
                        emphasis: true,
                      },
                    ]}
                    source={srcPackaging}
                  />
                }
              />
            </div>

            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
              aria-controls="advanced-drawer"
              className="mt-3 flex w-full items-center justify-between rounded-lg bg-plum/10 px-3 py-2 text-xs font-semibold text-plum transition-colors hover:bg-plum/15"
            >
              <span>{t('btn.advanced')}</span>
              <span aria-hidden="true" className="text-sm leading-none">
                {advancedOpen ? '−' : '+'}
              </span>
            </button>

            {advancedOpen ? (
              <div id="advanced-drawer" className="mt-3 space-y-3 rounded-card bg-white/70 p-3">
                <p className="text-[11px] leading-snug text-body/70">
                  Every auto-filled value is an estimate. Override any of them and the floor updates
                  live. Nothing here is hidden from you.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <PercentField
                    label={t('label.codShare')}
                    value={draft.codShare}
                    onChange={(v) => set('codShare', v)}
                  />
                  <NumberField
                    label={t('label.packaging')}
                    provider={tagFor(srcPackaging)}
                    value={draft.packagingCost}
                    onChange={(v) => set('packagingCost', v)}
                    min={0}
                    step={1}
                    prefix="₹"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <PercentField
                    label="RTO on COD orders"
                    value={draft.rtoCod}
                    onChange={(v) => set('rtoCod', v)}
                  />
                  <PercentField
                    label="RTO on prepaid"
                    value={draft.rtoPrepaid}
                    onChange={(v) => set('rtoPrepaid', v)}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <PercentField
                    label="Returns low"
                    provider={tagFor(srcReturnRate)}
                    value={draft.returnRateLow}
                    onChange={(v) => set('returnRateLow', v)}
                  />
                  <PercentField
                    label="Expected"
                    provider={tagFor(srcReturnRate)}
                    value={draft.returnRateExpected}
                    onChange={(v) => set('returnRateExpected', v)}
                  />
                  <PercentField
                    label="High"
                    provider={tagFor(srcReturnRate)}
                    value={draft.returnRateHigh}
                    onChange={(v) => set('returnRateHigh', v)}
                  />
                </div>

                <PercentField
                  label={t('label.writeOffShare')}
                  provider={tagFor(srcWriteOff)}
                  value={draft.writeOffShare}
                  onChange={(v) => set('writeOffShare', v)}
                  hint="Of the returns that come back, how many cannot be sold again."
                />

                {/* ------------------------------ who pays: policy settings */}
                <div className="space-y-2 rounded-lg bg-lilac/60 p-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-plum">
                    {t('policy.heading')}
                  </p>
                  <label className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={draft.forwardOnRto}
                      onChange={(e) => set('forwardOnRto', e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-orange"
                    />
                    <span>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-plum-deep">
                        {t('policy.forwardOnRto')}
                        <span className="rounded-full bg-magenta/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-magenta">
                          {t('assumptions.disputed')}
                        </span>
                      </span>
                      <span className="block text-[11px] leading-snug text-body/60">
                        {t('policy.forwardOnRtoHint')}
                      </span>
                    </span>
                  </label>
                  <SelectField
                    label={t('policy.rateSource')}
                    provider={draft.rateSource === 'dice' ? 'meesho' : 'assumption'}
                    value={draft.rateSource}
                    onChange={(v) => set('rateSource', v)}
                    options={[
                      { value: 'dice', label: t('policy.rateDice') },
                      { value: 'reported2026', label: t('policy.rate2026') },
                    ]}
                    hint={t('policy.rateSourceHint')}
                  />
                </div>

                <button
                  type="button"
                  onClick={resetToDefaults}
                  className="w-full rounded-lg bg-plum px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-plum-deep"
                >
                  {t('btn.reset')}
                </button>
              </div>
            ) : null}
          </Card>

          {/* -------------------------------------------------- what-if sliders */}
          <Card tone="white">
            <CardTitle hint={t('floor.whatIfHint')}>{t('floor.whatIf')}</CardTitle>
            <div className="space-y-4">
              <SliderField
                label={t('label.codShare')}
                provider="meesho"
                value={Math.round(draft.codShare * 100)}
                onChange={(v) => set('codShare', v / 100)}
                min={0}
                max={100}
                step={5}
                display={pct(draft.codShare, 0)}
                ends={['all prepaid', 'all COD']}
                hint="Prepaid orders are refused far less often. Meesho pays the RTO shipping, so this moves your floor only a little — it mostly means fewer parcels lost in transit."
              />

              <SliderField
                label="Return rate (most likely)"
                provider={tagFor(srcReturnRate)}
                value={Math.round(draft.returnRateExpected * 100)}
                onChange={(v) => setExpectedReturnRate(v / 100)}
                min={0}
                max={60}
                step={1}
                display={pct(draft.returnRateExpected, 0)}
                ends={['0%', '60%']}
                hint={`Low and high move with it — now ${pct(draft.returnRateLow, 0)} to ${pct(draft.returnRateHigh, 0)}.`}
              />

              <SliderField
                label={t('label.month')}
                provider="seller"
                value={monthRow.monthIndex}
                onChange={(v) => {
                  const next = months.find((m) => m.monthIndex === v)
                  if (next) set('month', next.key)
                }}
                min={0}
                max={11}
                step={1}
                display={`${monthRow.label_en} ×${index}`}
                ends={['Jan', 'Dec']}
                hint="Festive RTO means fewer deliveries. Your floor moves only slightly, because Meesho pays the RTO shipping — returns and product cost move it far more."
              />
            </div>
          </Card>
        </div>

        {/* ----------------------------------------------------------- outputs */}
        <div className="space-y-4">
          <Card tone="white">
            <CardTitle
              hint={t('floor.scenarioHint')}
            >
              {t('floor.scenario')}
            </CardTitle>
            <div
              role="group"
              aria-label="Return-rate scenario"
              className="grid grid-cols-3 gap-1.5 rounded-lg bg-lilac p-1.5"
            >
              {scenarioTabs.map((tab) => {
                const selected = scenario === tab.key
                return (
                  <button
                    key={tab.key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setScenario(tab.key)}
                    className={`rounded-md px-2 py-2 text-center transition-colors ${
                      selected ? 'bg-plum text-white' : 'text-plum hover:bg-white/70'
                    }`}
                  >
                    <span className="block text-[11px] font-semibold">{tab.label}</span>
                    <span
                      className={`block text-[10px] ${selected ? 'text-white/70' : 'text-body/60'}`}
                    >
                      {pct(tab.rate, 0)} {t('floor.returnsSuffix')}
                    </span>
                    <span
                      className={`block text-xs font-bold tabular-nums ${
                        selected ? 'text-orange' : 'text-plum-deep'
                      }`}
                    >
                      {inr(range[tab.key])}
                    </span>
                  </button>
                )
              })}
            </div>
          </Card>

          <Funnel result={active} />
          <CostTable result={active} deck={scenario === 'expected' ? deck : null} />
          <OverheadBars result={active} />

          <Card tone="lilac">
            <p className="text-xs leading-relaxed text-body">
              {t('floor.sourcesNote')}
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
