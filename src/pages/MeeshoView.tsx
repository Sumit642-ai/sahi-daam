import { useMemo } from 'react'

import { fees } from '../data'
import { inr, pct } from '../engine/format'
import { ANNUAL_ORDERS_MN, platformView } from '../engine/platform'
import { useI18n } from '../i18n'
import { Card, CardTitle } from '../components/Card'
import { ShowWorking } from '../components/ShowWorking'
import { SourceTag } from '../components/SourceTag'

/**
 * Meesho view — the platform lens.
 *
 * The same engine, turned round: for each category's example product, what the
 * seller pays, what the order costs to serve, what Meesho absorbs, and what
 * Meesho saves when one order moves from COD to prepaid. Category defaults
 * only — aggregated and anonymised, never an individual seller's cost.
 */
export function MeeshoView() {
  const { t, lang } = useI18n()
  const view = useMemo(() => platformView(), [])

  const th =
    'px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-body/50 align-bottom'

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-plum sm:text-3xl">
          {t('nav.platform')}{' '}
          <span className="text-base font-medium text-body/60">· {t('nav.platformSub')}</span>
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-body">{t('platform.lead')}</p>
      </div>

      <Card tone="white">
        <CardTitle hint={t('platform.tableHint')}>{t('platform.tableTitle')}</CardTitle>

        <div className="-mx-2 overflow-x-auto">
          <table className="w-full table-auto">
            <thead>
              <tr>
                <th scope="col" className={`${th} text-left`}>
                  {t('label.category')}
                </th>
                <th scope="col" className={`${th} text-right`}>
                  {t('platform.colSeller')}
                </th>
                <th scope="col" className={`${th} text-right`}>
                  {t('platform.colCts')}
                </th>
                <th scope="col" className={`${th} text-right`}>
                  {t('platform.colAbsorbs')}
                </th>
                <th scope="col" className={`${th} text-right`}>
                  {t('platform.colShift')}
                </th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((row, i) => (
                <tr key={row.categoryId} className={i % 2 === 1 ? 'bg-lilac/60' : ''}>
                  <th scope="row" className="px-2 py-2 text-left align-top text-xs font-normal">
                    <span className="block font-medium text-plum-deep">
                      {lang === 'hi' ? row.name_hi : row.name_en}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-body/60">
                      ₹{row.cogs} · {row.weightG} g
                      <SourceTag provider="assumption" />
                    </span>
                  </th>
                  <td className="px-2 py-2 text-right align-top text-sm font-semibold tabular-nums text-plum-deep">
                    {inr(row.sellerFloor)}
                  </td>
                  <td className="px-2 py-2 text-right align-top text-sm tabular-nums text-body">
                    {inr(row.costToServe)}
                  </td>
                  <td className="px-2 py-2 text-right align-top text-sm font-semibold tabular-nums text-[#8A4408]">
                    {inr(row.absorbsPerCleanSale)}
                  </td>
                  <td className="px-2 py-2 text-right align-top text-sm font-semibold tabular-nums text-profit">
                    {inr(row.shiftSavingPerOrder, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 rounded-card bg-plum p-4 text-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
            {t('platform.totalLabel')}
          </p>
          <p className="mt-1 text-3xl font-bold leading-none tracking-tight text-orange">
            ₹{view.savingPerOnePercentCr.toFixed(1)} Cr {t('platform.perYear')}
          </p>
          <p className="mt-2 text-[11px] leading-snug text-white/75">
            {t('platform.totalNote', {
              orders: ANNUAL_ORDERS_MN.toLocaleString('en-IN'),
              avg: inr(view.averageShiftSaving, 2),
              light: view.lightParcelSavingPerOnePercentCr.toFixed(1),
            })}
          </p>
          <ShowWorking
            className="mt-2"
            onDark
            withLabel
            title={t('platform.totalLabel').toLowerCase()}
            steps={[
              {
                label: 'Expected RTO, COD order → prepaid order',
                value: `${pct(fees.rtoCod, 0)} → ${pct(fees.rtoPrepaid, 0)}`,
              },
              {
                label: 'What one RTO costs Meesho',
                formula: `forward × (1 + ${pct(fees.gstRate, 0)} GST) + reverse, for the parcel's weight slab`,
                note: '₹50 × 1.18 + ₹120 = ₹179 at ≤ 500 g.',
              },
              {
                label: 'Saving per shifted order',
                formula: `${pct(fees.rtoCod - fees.rtoPrepaid, 0)} × RTO cost + ${inr(fees.codFee)} COD handling`,
                value: `${inr(view.averageShiftSaving, 2)} on an equal category mix`,
              },
              {
                label: '1% of annual orders',
                formula: `${ANNUAL_ORDERS_MN.toLocaleString('en-IN')} Mn ÷ 100`,
                value: `${(ANNUAL_ORDERS_MN / 100).toFixed(2)} Mn`,
              },
              {
                label: 'Saving a year',
                formula: `${(ANNUAL_ORDERS_MN / 100).toFixed(2)} Mn × ${inr(view.averageShiftSaving, 2)}`,
                value: `₹${view.savingPerOnePercentCr.toFixed(1)} Cr`,
                emphasis: true,
              },
            ]}
            source="RTO rates: Valmo DICE data pack. Order volume: 1,261 Mn in H1 FY26, as given. COD handling ₹7 and the equal category mix are ASSUMPTIONS."
          />
        </div>

        <p className="mt-3 rounded-lg bg-lilac px-3 py-2 text-xs font-medium text-plum-deep">
          {t('platform.privacy')}
        </p>
      </Card>
    </div>
  )
}
