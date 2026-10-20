/**
 * Home: the profit leak finder (spec v2, 7.5).
 *
 * Phone: one column. Tablet and up: the list beside an "at a glance" summary.
 * The top card ("3 products are costing you about ₹4,200 a month") appears
 * only when some product has an order count; without one there is no
 * honest monthly figure to show.
 */
import { useEffect, useState } from 'react'

import { inr } from '../../engine/format'
import { useT } from '../../i18n'
import { useProducts, useReportLinks, useShop } from '../hooks'
import { track } from '../telemetry'
import { type LeakFilter, type Status, filterRows, leakFinder } from '../lib/products'
import { ButtonLink, Card, LoadingPage, PageTitle, StatusBadge } from '../ui'
import { ProWaitlistCard, ShareCard } from './Growth'
import { FilterBar, ProductRow } from './ProductList'

export function Home() {
  const t = useT()
  const shop = useShop()
  const products = useProducts()
  const links = useReportLinks()
  const [filter, setFilter] = useState<LeakFilter>('ALL')
  const [query, setQuery] = useState('')
  const lf = shop && products && links ? leakFinder(products, shop, links) : null
  const losing = lf?.losingCount ?? 0
  // "Products found losing money": counted once a day per device (section 10).
  useEffect(() => {
    if (losing > 0) void track('leak_found', { losing })
  }, [losing])

  if (!shop || products === undefined || links === undefined) return <LoadingPage />

  if (products.length === 0) return <EmptyState />

  const rows = filterRows(lf!.rows, filter, query)
  const finder = lf!
  const counts = (s: Status) => finder.rows.filter((r) => r.status === s).length

  return (
    <div className="flex flex-col gap-5">
      <PageTitle>{t('home.title')}</PageTitle>

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,17rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <section className="flex min-w-0 flex-col gap-4">
          {finder.hasOrderCounts ? (
            <Card tone={finder.losingCount > 0 ? 'peach' : 'lilac'}>
              <p className={`text-xl font-bold md:text-2xl ${finder.losingCount > 0 ? 'text-loss' : 'text-healthy'}`}>
                {finder.losingCount === 0
                  ? t('home.noLeak')
                  : finder.losingCount === 1
                    ? t('home.leakTitleOne', { amount: inr(finder.monthlyLoss) })
                    : t('home.leakTitle', { count: finder.losingCount, amount: inr(finder.monthlyLoss) })}
              </p>
              <p className="mt-1 text-sm text-muted">
                {t(finder.basis === 'report' ? 'home.leakBasisReport' : finder.basis === 'mixed' ? 'home.leakBasisMixed' : 'home.leakBasis')}
              </p>
            </Card>
          ) : null}

          <FilterBar filter={filter} onFilter={setFilter} query={query} onQuery={setQuery} total={finder.rows.length} />

          {rows.length === 0 ? (
            <p className="text-base text-muted">{t('home.noMatch')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((r) => (
                <li key={r.product.id}>
                  <ProductRow row={r} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <Card tone="lilac">
            <h2 className="text-lg font-semibold text-ink">{t('home.summaryTitle')}</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {(['LOSS', 'THIN', 'HEALTHY'] as const).map((s) => (
                <li key={s} className="flex items-center justify-between gap-2 text-base">
                  <span>{t(`summary.${s}`, { n: counts(s) })}</span>
                  <StatusBadge status={s} />
                </li>
              ))}
            </ul>
          </Card>
          <ButtonLink to="/products/new">{t('nav.addProduct')}</ButtonLink>
          <ButtonLink to="/upload" variant="secondary">
            {links.size > 0 ? t('home.reportNudgeAgain') : t('home.reportNudge')}
          </ButtonLink>
          <ProWaitlistCard />
          <ShareCard />
        </aside>
      </div>
    </div>
  )
}

function EmptyState() {
  const t = useT()
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-4 py-6">
      <PageTitle>{t('home.emptyTitle')}</PageTitle>
      <p className="text-lg text-body">{t('home.emptyBody')}</p>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <ButtonLink to="/upload">{t('landing.upload')}</ButtonLink>
        <ButtonLink to="/products/new" variant="secondary">
          {t('nav.addProduct')}
        </ButtonLink>
      </div>
    </div>
  )
}
