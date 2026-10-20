/**
 * Products: a list–detail split on laptops (list left, selected product
 * right), one screen at a time on phones and tablets.
 */
import { useState } from 'react'
import { Outlet, useParams } from 'react-router-dom'

import { useT } from '../../i18n'
import { useProducts, useReportLinks, useShop } from '../hooks'
import { filterRows, leakFinder, type LeakFilter } from '../lib/products'
import { ButtonLink, Card, LoadingPage, PageTitle } from '../ui'
import { FilterBar, ProductRow } from './ProductList'

export function ProductsLayout() {
  const { id } = useParams()
  const selected = id !== undefined
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start lg:gap-8">
      <div className={selected ? 'hidden lg:block' : ''}>
        <ProductListPane />
      </div>
      <div className={selected ? 'min-w-0' : 'hidden min-w-0 lg:block'}>
        <Outlet />
      </div>
    </div>
  )
}

function ProductListPane() {
  const t = useT()
  const shop = useShop()
  const products = useProducts()
  const links = useReportLinks()
  const [filter, setFilter] = useState<LeakFilter>('ALL')
  const [query, setQuery] = useState('')

  if (!shop || products === undefined || links === undefined) return <LoadingPage />
  const rows = filterRows(leakFinder(products, shop, links).rows, filter, query)

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>{t('products.title')}</PageTitle>
        <ButtonLink to="/products/new" className="lg:hidden">
          {t('nav.addProduct')}
        </ButtonLink>
      </div>
      {products.length === 0 ? (
        <p className="text-base text-body/80">{t('home.emptyBody')}</p>
      ) : (
        <>
          <FilterBar filter={filter} onFilter={setFilter} query={query} onQuery={setQuery} total={products.length} />
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
        </>
      )}
    </section>
  )
}

/** The right-hand pane on a laptop before a product is picked. */
export function ProductsIndex() {
  const t = useT()
  return (
    <Card tone="lilac" className="flex min-h-[12rem] items-center justify-center text-center">
      <p className="text-lg text-body">{t('products.select')}</p>
    </Card>
  )
}
