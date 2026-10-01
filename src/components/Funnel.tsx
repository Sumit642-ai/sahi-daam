import type { FloorResult } from '../engine/floor'
import { pct, units } from '../engine/format'
import { useI18n } from '../i18n'
import { Card, CardTitle } from './Card'
import { ShowWorking } from './ShowWorking'

/**
 * Spec section 9.2: "100 dispatched → delivered → clean sales, with the leak
 * labelled at each step (RTO, returns)."
 *
 * The leak is the whole point, so each bar shows the surviving part in plum and
 * what was lost in magenta, to scale.
 */
interface FunnelProps {
  result: FloorResult
}

interface StageProps {
  label: string
  value: number
  share: number
  leak?: { label: string; value: number; share: number }
  working: React.ReactNode
}

/** A share as a rounded percentage, never NaN and never outside 0-100. */
function widthPct(share: number): number {
  if (!Number.isFinite(share)) return 0
  return Math.round(Math.max(0, Math.min(1, share)) * 1000) / 10
}

function Stage({ label, value, share, leak, working }: StageProps) {
  const { t } = useI18n()
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-plum-deep">
          {label}
          {working}
        </span>
        <span className="text-sm font-bold tabular-nums text-plum-deep">
          {units(value)}
          <span className="text-xs font-normal text-body/50"> {t('funnel.of100')}</span>
        </span>
      </div>
      <div className="mt-1 flex h-7 w-full overflow-hidden rounded-lg bg-lilac">
        <div
          className="flex items-center bg-plum transition-[width] duration-200"
          style={{ width: `${widthPct(share)}%` }}
        />
        {leak && leak.share > 0 ? (
          <div
            className="flex items-center justify-end bg-magenta pr-2 transition-[width] duration-200"
            style={{ width: `${widthPct(leak.share)}%` }}
          >
            <span className="whitespace-nowrap text-[10px] font-semibold text-white">
              −{units(leak.value)}
            </span>
          </div>
        ) : null}
      </div>
      {leak ? (
        <p className="mt-1 text-[11px] text-body/70">
          <span className="font-semibold text-magenta">{leak.label}</span> {units(leak.value)} orders
          lost here ({pct(leak.share)} of the 100 dispatched)
        </p>
      ) : null}
    </div>
  )
}

export function Funnel({ result }: FunnelProps) {
  const { t } = useI18n()
  const n = result.unitsBasis
  return (
    <Card tone="white">
      <CardTitle hint={t('floor.funnelHint')}>{t('floor.funnel')}</CardTitle>

      <div className="space-y-4">
        <Stage
          label={t('funnel.dispatched')}
          value={n}
          share={1}
          working={
            <ShowWorking
              title="orders dispatched"
              steps={[
                {
                  label: 'Basis for the whole calculation',
                  formula: 'unitsBasis = 100',
                  value: '100 orders',
                  note: 'Model convention: every cost is computed per 100 orders dispatched, which is what makes the flat per-order costs comparable across price points.',
                },
              ]}
              source="Model convention (fees.json unitsBasis)"
            />
          }
        />

        <Stage
          label={t('funnel.delivered')}
          value={result.deliveredUnits}
          share={result.deliveredUnits / n}
          leak={{
            label: t('funnel.lostRto'),
            value: result.rtoUnits,
            share: result.rtoUnits / n,
          }}
          working={
            <ShowWorking
              title="orders delivered"
              steps={[
                {
                  label: 'Blended RTO rate',
                  formula: `(${pct(result.input.codShare, 0)} × ${pct(result.input.rtoCod, 0)}) + (${pct(1 - result.input.codShare, 0)} × ${pct(result.input.rtoPrepaid, 0)}) × ${result.input.seasonIndex}`,
                  value: pct(result.rto),
                  note: 'COD orders are refused far more often than prepaid ones, so the blend follows your COD share.',
                },
                {
                  label: 'Orders that never reach the buyer',
                  formula: `100 × ${pct(result.rto)}`,
                  value: `${units(result.rtoUnits)} orders`,
                },
                {
                  label: 'Delivered',
                  formula: `100 − ${units(result.rtoUnits)}`,
                  value: `${units(result.deliveredUnits)} orders`,
                  emphasis: true,
                },
              ]}
              source="RTO rates from the Valmo DICE data pack; season index from Unicommerce via MediaBrief"
            />
          }
        />

        <Stage
          label={t('funnel.clean')}
          value={result.cleanSales}
          share={result.cleanSales / n}
          leak={{
            label: t('funnel.lostReturn'),
            value: result.returnUnits,
            share: result.returnUnits / n,
          }}
          working={
            <ShowWorking
              title="clean sales"
              steps={[
                {
                  label: 'Returns, as a share of delivered orders',
                  formula: `${units(result.deliveredUnits)} delivered × ${pct(result.input.returnRate, 0)}`,
                  value: `${units(result.returnUnits)} orders`,
                },
                {
                  label: 'Clean sales',
                  formula: `${units(result.deliveredUnits)} − ${units(result.returnUnits)}`,
                  value: `${units(result.cleanSales)} orders`,
                  emphasis: true,
                },
                {
                  label: 'Of those returns, how many cannot be resold',
                  formula: `${units(result.returnUnits)} × ${pct(result.input.writeOffShare, 0)} unsellable share`,
                  value: `${units(result.writeOffUnits)} units`,
                  note: 'These are a total loss — you paid for the product and cannot sell it again.',
                },
                {
                  label: 'Survival rate',
                  formula: `${units(result.cleanSales)} ÷ 100 dispatched`,
                  value: pct(result.survivalRate),
                },
              ]}
              source="Category return rate and unsellable share — see Screen 6"
            />
          }
        />
      </div>

      <p className="mt-4 rounded-lg bg-peach px-3 py-2 text-xs text-body">
        Only <span className="font-bold text-orange">{units(result.cleanSales)}</span> of the 100
        orders you packed and shipped actually earn you anything. The other{' '}
        <span className="font-semibold text-magenta">
          {units(result.rtoUnits + result.returnUnits)}
        </span>{' '}
        still cost you shipping, packaging and COD handling.
      </p>
    </Card>
  )
}
