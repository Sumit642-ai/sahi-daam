import { useMemo, useState } from 'react'

import type { FloorInput, ReturnRateTriple } from '../engine/floor'
import { inr, pct, signedInr, units } from '../engine/format'
import { type SaleVerdict, saleCheck } from '../engine/sale'
import { useI18n } from '../i18n'
import { Card, CardTitle } from './Card'
import { NumberField } from './Field'
import { ShowWorking } from './ShowWorking'

/**
 * "Should I join this sale?" — on Bazaar Ka Daam, below the stage cards.
 *
 * Takes the price on the slider, a sale discount and an expected order lift,
 * and answers on the seller floor: Join, Join only if you push prepaid, or
 * Skip. The order lift is an assumption and is tagged as one.
 */
interface SaleCheckCardProps {
  price: number
  input: FloorInput
  returnRates: ReturnRateTriple
  weeklyOrders: number
}

const TONE: Record<SaleVerdict, string> = {
  JOIN: 'bg-profit/10 text-profit',
  JOIN_IF_PREPAID: 'bg-orange/15 text-[#8A4408]',
  SKIP_LOSS: 'bg-magenta/10 text-magenta',
  SKIP_LESS: 'bg-magenta/10 text-magenta',
}

export function SaleCheckCard({ price, input, returnRates, weeklyOrders }: SaleCheckCardProps) {
  const { t } = useI18n()
  const [discountPct, setDiscountPct] = useState<number | null>(20)
  const [liftPct, setLiftPct] = useState<number | null>(30)

  const check = useMemo(
    () =>
      saleCheck({
        price,
        discount: (discountPct ?? 0) / 100,
        orderLift: (liftPct ?? 0) / 100,
        weeklyOrders,
        input,
        returnRates,
      }),
    [price, discountPct, liftPct, weeklyOrders, input, returnRates],
  )

  const weekDelta = check.weekJoining - check.weekNotJoining

  return (
    <Card tone="white">
      <CardTitle hint={t('sale.hint')}>{t('sale.title')}</CardTitle>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label={t('sale.discount')}
          provider="seller"
          value={discountPct}
          onChange={setDiscountPct}
          min={0}
          max={90}
          step={5}
          suffix="%"
        />
        <NumberField
          label={t('sale.lift')}
          provider="assumption"
          value={liftPct}
          onChange={setLiftPct}
          min={0}
          max={500}
          step={5}
          suffix="%"
          hint={t('sale.liftHint')}
        />
      </div>

      <p className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold leading-snug ${TONE[check.verdict]}`}>
        {check.headline}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: t('sale.salePrice'), value: inr(check.salePrice), tone: 'text-plum-deep' },
          {
            label: t('sale.perSaleAtSale'),
            value: signedInr(check.perSaleAtSale),
            tone: check.perSaleAtSale >= 0 ? 'text-profit' : 'text-magenta',
          },
          {
            label: t('sale.weekNotJoining'),
            value: signedInr(check.weekNotJoining),
            tone: check.weekNotJoining >= 0 ? 'text-profit' : 'text-magenta',
          },
          {
            label: t('sale.weekJoining'),
            value: signedInr(check.weekJoining),
            tone: check.weekJoining >= 0 ? 'text-profit' : 'text-magenta',
          },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg bg-lilac/70 px-3 py-2">
            <dt className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-body/60">
              {stat.label}
            </dt>
            <dd className={`mt-1 text-lg font-bold tabular-nums ${stat.tone}`}>{stat.value}</dd>
          </div>
        ))}
      </dl>

      <ShowWorking
        className="mt-2"
        title={t('sale.title').toLowerCase()}
        withLabel
        steps={[
          {
            label: 'Sale price',
            formula: `${inr(price)} × (1 − ${pct(check.discount, 0)})`,
            value: inr(check.salePrice),
            note: 'Rounded to whole rupees, as listings are.',
          },
          { label: 'Your floor (what you pay)', value: inr(check.floor, 2) },
          {
            label: 'Kept per clean sale, today',
            formula: `${inr(price)} − ${inr(check.floor, 2)}`,
            value: signedInr(check.perSaleNow, 2),
          },
          {
            label: 'Kept per clean sale, at the sale price',
            formula: `${inr(check.salePrice)} − ${inr(check.floor, 2)}`,
            value: signedInr(check.perSaleAtSale, 2),
            emphasis: true,
          },
          {
            label: 'Clean sales per order dispatched',
            value: pct(check.survival),
          },
          {
            label: 'A normal week, not joining',
            formula: `${units(check.weeklyOrders)} orders × ${pct(check.survival)} × ${signedInr(check.perSaleNow, 2)}`,
            value: signedInr(check.weekNotJoining),
          },
          {
            label: 'The sale week, joining',
            formula: `${units(Math.round(check.saleWeekOrders))} orders × ${pct(check.survival)} × ${signedInr(check.perSaleAtSale, 2)}`,
            value: signedInr(check.weekJoining),
            note: `${signedInr(weekDelta)} against not joining. The order lift is an assumption — change it above.`,
          },
          {
            label: `With the prepaid fix (COD ${pct(input.codShare, 0)} → ${pct(check.prepaidCodShare, 0)})`,
            value: inr(check.prepaidFloor, 2),
            note: `Floor if you push prepaid. The sale week would earn ${signedInr(check.weekJoiningPrepaid)}.`,
          },
          {
            label: 'Verdict',
            note: check.headline,
          },
        ]}
        source="Seller floor from Meesho's supplier policy; weekly orders from your shop answers; order lift is an ASSUMPTION."
      />
    </Card>
  )
}
