import { useLiveQuery } from 'dexie-react-hooks'
import { useLocation, useNavigate } from 'react-router-dom'

import { type Product, type Report, type Shop, type SkuStatsRow, db } from './db'
import { type ReportLink, latestBySku } from './report/store'
import { getShop } from './repo'

/** undefined while loading, null when there is no shop yet. */
export function useShop(): Shop | null | undefined {
  return useLiveQuery(async () => (await getShop()) ?? null, [])
}

/** undefined while loading. */
export function useProducts(): Product[] | undefined {
  return useLiveQuery(() => db.products.toArray(), [])
}

/** undefined while loading, null when it doesn't exist. */
export function useProduct(id: string | undefined): Product | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.products.get(id)) ?? null) : null), [id])
}

/** Reports, newest first. undefined while loading. */
export function useReports(): Report[] | undefined {
  return useLiveQuery(() => db.reports.orderBy('uploadedAt').reverse().toArray(), [])
}

export function useSkuStats(): SkuStatsRow[] | undefined {
  return useLiveQuery(() => db.skuStats.toArray(), [])
}

/** Each SKU's totals from its latest report. undefined while loading. */
export function useReportLinks(): Map<string, ReportLink> | undefined {
  return useLiveQuery(async () => latestBySku(await db.skuStats.toArray(), await db.reports.toArray()), [])
}

/**
 * In-app back that behaves like browser back (spec 8.2): go back one entry
 * when there is somewhere in the app to go back to, otherwise to `fallback`.
 */
export function useBack(fallback: string): () => void {
  const navigate = useNavigate()
  // React Router keys the first entry of a session "default": nothing in the app before it.
  const canGoBack = useLocation().key !== 'default'
  return () => {
    if (canGoBack) navigate(-1)
    else navigate(fallback, { replace: true })
  }
}
