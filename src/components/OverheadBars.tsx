import type { FloorResult } from '../engine/floor'
import { inr, pct, units } from '../engine/format'
import { useI18n, type TranslationKey } from '../i18n'
import { Card, CardTitle } from './Card'
import { ShowWorking } from './ShowWorking'

/**
 * Spec section 9.2: "Bar breakdown of the overhead per clean sale (₹ per line)."
 *
 * The cost table is in rupees per 100 dispatched, which is the honest basis but
 * hard to feel. This is the same seven lines in rupees per surviving sale, which
 * is the number that has to come out of the price.
 */
interface OverheadBarsProps {
  result: FloorResult
}

export function OverheadBars({ result }: OverheadBarsProps) {
  const { t } = useI18n()
  const cleanSales = result.cleanSales
  const lines = result.costLines
    .map((line) => ({
      key: line.key,
      label: t(line.labelKey as TranslationKey),
      working: line.working,
      total: line.amount,
      perSale: line.amount / cleanSales,
    }))
    .sort((a, b) => b.perSale - a.perSale)

  // With no surviving sale every per-sale figure is Infinity, and Infinity over
  // Infinity is NaN — which React happily writes into a style attribute.
  const viable = Number.isFinite(cleanSales) && cleanSales > 0
  const max = viable ? Math.max(...lines.map((l) => l.perSale), 1) : 1
  const widthOf = (perSale: number) =>
    viable && Number.isFinite(perSale) ? Math.round((perSale / max) * 1000) / 10 : 0

  return (
    <Card tone="white">
      <CardTitle
        hint={t('floor.overheadBarsHint')}
        aside={
          <ShowWorking
            title="the overhead per clean sale"
            withLabel
            steps={[
              {
                label: 'Total overhead on 100 dispatched',
                formula: result.costLines.map((l) => inr(l.amount)).join(' + '),
                value: inr(result.totalOverhead),
              },
              {
                label: 'Clean sales out of those 100',
                value: units(cleanSales),
              },
              {
                label: 'Each bar below',
                formula: 'that line’s cost ÷ clean sales',
                note: 'So the bars add up to the overhead per clean sale, which is what gets added to COGS to make the floor.',
              },
              {
                label: 'Overhead per clean sale',
                formula: `${inr(result.totalOverhead)} ÷ ${units(cleanSales)}`,
                value: inr(result.overheadPerCleanSale, 2),
                emphasis: true,
              },
            ]}
          />
        }
      >
        {t('floor.overheadBars')}
      </CardTitle>

      <ul className="space-y-2.5">
        {lines.map((line) => (
          <li key={line.key}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="flex items-center gap-1.5 text-xs text-body">
                {line.label}
                <ShowWorking
                  title={`${line.label.toLowerCase()} per clean sale`}
                  steps={[
                    {
                      label: 'On 100 orders dispatched',
                      formula: line.working,
                      value: inr(line.total),
                    },
                    {
                      label: 'Per clean sale',
                      formula: `${inr(line.total)} ÷ ${units(cleanSales)} clean sales`,
                      value: inr(line.perSale, 2),
                      emphasis: true,
                    },
                    {
                      label: 'Share of your total overhead',
                      formula: `${inr(line.total)} ÷ ${inr(result.totalOverhead)}`,
                      value: pct(line.total / result.totalOverhead),
                    },
                  ]}
                />
              </span>
              <span className="text-xs font-bold tabular-nums text-plum-deep">
                {inr(line.perSale, 2)}
              </span>
            </div>
            <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-lilac">
              <div
                className="h-full rounded-full bg-orange transition-[width] duration-200"
                style={{ width: `${widthOf(line.perSale)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg bg-peach px-3 py-2">
        <span className="text-xs font-semibold text-plum-deep">{t('floor.overheadTotal')}</span>
        <span className="text-lg font-bold tabular-nums text-orange">
          {inr(result.overheadPerCleanSale, 2)}
        </span>
      </div>
    </Card>
  )
}
