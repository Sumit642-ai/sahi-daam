/**
 * The product rows shared by the leak finder (Home) and the Products list:
 * product · price · "you keep ₹X a sale" · "₹Y a month" · status · data badge.
 */
import { NavLink } from 'react-router-dom'

import { inr } from '../../engine/format'
import { LOW_DATA_ORDERS } from '../../engine/report'
import { useT } from '../../i18n'
import { type LeakFilter, type ProductSummary, SEARCH_AFTER } from '../lib/products'
import { STATUS_TEXT, SourceChip, StatusBadge } from '../ui'

export function ProductRow({ row }: { row: ProductSummary }) {
  const t = useT()
  const { product, result, status, monthly } = row
  const keep = result.keep
  return (
    <NavLink
      to={`/products/${product.id}`}
      className={({ isActive }) =>
        `block rounded-card border-2 p-4 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange ${
          isActive ? 'border-plum bg-lilac' : 'border-plum/10 bg-white hover:border-plum/40'
        }`
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 break-words text-lg font-semibold text-ink">{product.name}</p>
          <p className="text-base text-body/80">{inr(row.input.price)}</p>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className={`text-base font-semibold ${STATUS_TEXT[status]}`}>
          {Number.isFinite(keep) && keep >= 0
            ? t('home.keepPerSale', { amount: inr(keep) })
            : t('home.losePerSale', { amount: inr(Math.abs(keep)) })}
        </p>
        {monthly !== null && Number.isFinite(monthly) ? (
          <p className="text-base text-body/80">{t('home.perMonth', { amount: inr(monthly) })}</p>
        ) : null}
        <span className="ml-auto flex flex-wrap gap-1">
          {row.report?.report.synthetic ? (
            <span className="rounded-full bg-peach px-2 py-0.5 text-xs font-semibold uppercase text-thin">{t('done.sampleChip')}</span>
          ) : null}
          {row.report && row.report.row.orders < LOW_DATA_ORDERS ? (
            <span className="rounded-full bg-peach px-2 py-0.5 text-xs font-semibold text-thin">{t('done.lowDataChip')}</span>
          ) : null}
          <SourceChip source={row.estimated ? 'ESTIMATED' : 'FROM_REPORT'} />
        </span>
      </div>
    </NavLink>
  )
}

export function FilterBar({
  filter,
  onFilter,
  query,
  onQuery,
  total,
}: {
  filter: LeakFilter
  onFilter: (f: LeakFilter) => void
  query: string
  onQuery: (q: string) => void
  total: number
}) {
  const t = useT()
  const options: { value: LeakFilter; label: string }[] = [
    { value: 'ALL', label: t('home.filterAll') },
    { value: 'LOSS', label: t('home.filterLoss') },
    { value: 'THIN', label: t('home.filterThin') },
  ]
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={t('home.filters')} className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={filter === o.value}
            onClick={() => onFilter(o.value)}
            className={`min-h-tap rounded-full border-2 px-4 text-base font-medium ${
              filter === o.value ? 'border-plum bg-plum text-white' : 'border-plum/20 text-plum hover:bg-lilac'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {total > SEARCH_AFTER ? (
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t('home.search')}
          aria-label={t('home.search')}
          className="min-h-tap w-full min-w-0 rounded-xl border-2 border-plum/20 px-3 text-base focus:outline-none focus:ring-2 focus:ring-orange"
        />
      ) : null}
    </div>
  )
}
