import type { FloorRange, FloorResult } from '../engine/floor'
import { inr, pct } from '../engine/format'
import { Card } from './Card'
import { useI18n } from '../i18n'
import { ShowWorking, type WorkingStep } from './ShowWorking'

/**
 * Spec section 9.2: "Your true floor: ₹low – ₹high (most likely ₹expected)".
 * The hero number of the whole product, so it is the biggest thing on the page
 * and it is orange on plum.
 */
interface FloorHeadlineProps {
  range: FloorRange
  /** The deck's rounded worked example, when the inputs are still that kurti. */
  deck: FloorResult | null
  monthLabel: string
  seasonIndex: number
}

export function FloorHeadline({ range, deck, monthLabel, seasonIndex }: FloorHeadlineProps) {
  const { t } = useI18n()
  const expected = range.results.expected
  const rtoNote =
    seasonIndex === 1
      ? `${monthLabel} is the baseline month, so RTO is not lifted by the season.`
      : `${monthLabel} lifts RTO by ×${seasonIndex} to ${pct(expected.rto)}.`

  const steps: WorkingStep[] = [
    {
      label: 'RTO rate on dispatched orders',
      formula: `(${pct(expected.input.codShare, 0)} COD × ${pct(expected.input.rtoCod, 0)}) + (${pct(1 - expected.input.codShare, 0)} prepaid × ${pct(expected.input.rtoPrepaid, 0)}) × ${seasonIndex}`,
      value: pct(expected.rto),
      note: rtoNote,
    },
    {
      label: 'Of 100 orders dispatched, how many become a clean sale',
      formula: `100 − ${expected.rtoUnits.toFixed(1)} RTO = ${expected.deliveredUnits.toFixed(1)} delivered; − ${expected.returnUnits.toFixed(1)} returned = ${expected.cleanSales.toFixed(1)}`,
      value: `${expected.cleanSales.toFixed(1)} of 100`,
    },
    {
      label: 'Total overhead on those 100 dispatched',
      formula: expected.costLines.map((l) => inr(l.amount)).join(' + '),
      value: inr(expected.totalOverhead),
    },
    {
      label: 'Overhead each surviving sale has to carry',
      formula: `${inr(expected.totalOverhead)} ÷ ${expected.cleanSales.toFixed(1)} clean sales`,
      value: inr(expected.overheadPerCleanSale, 2),
    },
    {
      label: 'Your true floor',
      formula: `${inr(expected.input.cogs)} COGS + ${inr(expected.overheadPerCleanSale, 2)} overhead`,
      value: inr(range.expected, 2),
      emphasis: true,
    },
    {
      label: `Same sum at your low return rate (${pct(range.returnRates.low, 0)})`,
      value: inr(range.low, 2),
      note: 'The optimistic end of the range.',
    },
    {
      label: `Same sum at your high return rate (${pct(range.returnRates.high, 0)})`,
      value: inr(range.high, 2),
      note: 'The pessimistic end. Price for this and you are safe in a bad month.',
    },
  ]

  return (
    <Card tone="plum">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
            {t('floor.headline')}
          </p>
          <p className="mt-1 text-[2.5rem] font-bold leading-none tracking-tight text-orange sm:text-5xl">
            {inr(range.low)} <span className="text-white/50">–</span> {inr(range.high)}
          </p>
          <p className="mt-2 text-sm text-white/85">
            {t('label.mostLikely')}{' '}
            <span className="font-bold text-white">{inr(range.expected)}</span>
            <span className="text-white/60">
              {' '}
              {t('floor.atReturnRate', { rate: pct(range.returnRates.expected, 0) })}
            </span>
          </p>
        </div>

        <dl className="flex gap-x-6 gap-y-2">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-white/60">
              {t('label.cleanSales')}
            </dt>
            <dd className="text-lg font-bold tabular-nums text-white">
              {expected.cleanSales.toFixed(1)}
              <span className="text-sm font-normal text-white/60">/100</span>
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-white/60">
              {t('label.rto')}
            </dt>
            <dd className="text-lg font-bold tabular-nums text-white">{pct(expected.rto)}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-white/60">
              {t('floor.overheadPerSale')}
            </dt>
            <dd className="text-lg font-bold tabular-nums text-white">
              {inr(expected.overheadPerCleanSale)}
            </dd>
          </div>
        </dl>
      </div>

      <ShowWorking
        className="mt-3"
        title={t('floor.headline')}
        steps={steps}
        onDark
        withLabel
        source="Shipping and RTO from the Valmo DICE data pack; COD fee, GST and category return rates are ASSUMPTIONS — see Screen 6."
        footer={
          deck ? (
            <p>
              <span className="font-semibold text-plum">Deck worked example.</span> With the
              deck&rsquo;s rounded whole units ({deck.rtoUnits} RTO, {deck.returnUnits} returned,{' '}
              {deck.writeOffUnits} unsellable, {deck.cleanSales} clean sales) the same formula gives{' '}
              {inr(deck.totalOverhead)} ÷ {deck.cleanSales} + {inr(deck.input.cogs)} ={' '}
              <strong>{inr(deck.floor)}</strong>. The continuous model above does not round, so it
              lands a little either side.
            </p>
          ) : null
        }
      />
    </Card>
  )
}
