import type { FloorRange } from '../engine/floor'
import { inr, pct } from '../engine/format'
import type { Recommendation, Stage } from '../engine/recommend'
import { useI18n } from '../i18n'
import { ShowWorking } from './ShowWorking'

/**
 * One lifecycle stage card: the recommended price and the rationale lines,
 * every one of which carries the actual numbers.
 */
interface StageCardProps {
  recommendation: Recommendation
  range: FloorRange
  /** The stage the screen is currently looking at. */
  active: boolean
  onSelect: (stage: Stage) => void
}

export function StageCard({ recommendation, range, active, onSelect }: StageCardProps) {
  const { t } = useI18n()
  const { stage, price, rationale, warnings, minMargin, provisional } = recommendation
  const perSale = price - range.expected
  const margin = price > 0 ? perSale / price : 0

  return (
    <div
      className={`rounded-card p-4 transition-colors ${active ? 'bg-plum text-white' : 'bg-lilac'}`}
    >
      <button
        type="button"
        onClick={() => onSelect(stage)}
        aria-pressed={active}
        className="flex w-full items-baseline justify-between gap-3 text-left"
      >
        <span>
          <span
            className={`block text-xs font-semibold uppercase tracking-wide ${
              active ? 'text-white/70' : 'text-plum'
            }`}
          >
            {t(`stage.${stage}`)}
          </span>
          <span className={`block text-[11px] ${active ? 'text-white/60' : 'text-body/60'}`}>
            {t(`stage.${stage}.aim`)}
          </span>
        </span>
        {provisional ? (
          <span className="max-w-[9.5rem] shrink-0 text-right">
            <span className={`block text-sm font-bold leading-tight ${active ? 'text-orange' : 'text-plum-deep'}`}>
              {t('stage.peakYourStepsFind')}
            </span>
            <span className={`block text-[11px] tabular-nums ${active ? 'text-white/70' : 'text-body/60'}`}>
              {t('stage.rampStartsAt', { price: inr(price) })}
            </span>
          </span>
        ) : (
          <span className={`shrink-0 text-2xl font-bold tabular-nums ${active ? 'text-orange' : 'text-plum-deep'}`}>
            {inr(price)}
          </span>
        )}
      </button>

      <ul className={`mt-3 space-y-1.5 text-[11px] leading-snug ${active ? 'text-white/85' : 'text-body'}`}>
        {rationale.map((line, i) => (
          <li key={i} className="flex gap-1.5">
            <span className={active ? 'text-orange' : 'text-plum/50'}>·</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>

      {warnings.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {warnings.map((w, i) => (
            <li
              key={i}
              className={`rounded-lg px-2 py-1.5 text-[11px] font-medium ${
                active ? 'bg-white/15 text-white' : 'bg-magenta/10 text-magenta'
              }`}
            >
              {w}
            </li>
          ))}
        </ul>
      ) : null}

      <div
        className={`mt-3 flex flex-wrap gap-x-4 gap-y-1 rounded-lg px-2 py-1.5 text-[11px] ${
          active ? 'bg-white/10' : 'bg-white/70'
        }`}
      >
        <span>
          {t('label.perSale')}{' '}
          <strong className={perSale >= 0 ? (active ? 'text-white' : 'text-profit') : 'text-magenta'}>
            {inr(perSale)}
          </strong>
        </span>
        <span>
          {t('label.margin')} <strong className={active ? 'text-white' : 'text-plum-deep'}>{pct(margin)}</strong>
        </span>
      </div>

      <ShowWorking
        className="mt-2"
        title={t(`stage.${stage}`).toLowerCase()}
        onDark={active}
        withLabel
        steps={[
          { label: t(`stage.${stage}`), note: t(`stage.${stage}.aim`) },
          ...rationale.map((line) => ({ label: line })),
          {
            label: 'Guardrail',
            formula: `price ${inr(price)} ≥ floor ${inr(range.expected, 2)}`,
            value: 'passes',
            note: `No stage may ever recommend below the floor. The thinnest margin allowed is ${inr(minMargin)} (the greater of ₹5 and 2% of the floor).`,
          },
          {
            label: 'What you clear at this price',
            formula: `${inr(price)} − ${inr(range.expected, 2)}`,
            value: inr(perSale, 2),
            emphasis: true,
          },
        ]}
      />
    </div>
  )
}
