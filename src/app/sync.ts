/**
 * Background work for the app shell: keep the weekly checks current (they run
 * on every report upload, every edit and every app open, spec 7.8), count an
 * activated seller once, and send the queue when the phone is online.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'

import { db } from './db'
import { computeChecks } from './lib/checks'
import { keepInputFor, linkFor, summarise } from './lib/products'
import { judgeProductStep } from './lib/steps'
import { latestBySku } from './report/store'
import { syncChecks } from './repo'
import { flush, track } from './telemetry'

/** Everything the checks read, as one live snapshot. */
function useSnapshot() {
  return useLiveQuery(async () => {
    const [shop, products, rows, reports, competitor, steps] = await Promise.all([
      db.shop.get('main'),
      db.products.toArray(),
      db.skuStats.toArray(),
      db.reports.toArray(),
      db.competitor.toArray(),
      db.priceSteps.toArray(),
    ])
    return { shop, products, rows, reports, competitor, steps }
  }, [])
}

export function useAppSync(): void {
  const snap = useSnapshot()

  useEffect(() => {
    if (!snap?.shop?.onboardedAt) return
    const { shop, products, rows, reports, competitor, steps } = snap
    const links = latestBySku(rows, reports)
    const summaries = new Map(products.map((p) => [p.id, summarise(p, shop, linkFor(p, links))]))
    const judged = steps.map((step) => {
      const product = products.find((p) => p.id === step.productId)
      const j = product
        ? judgeProductStep({ step, sku: product.sku, base: keepInputFor(product, shop), rows, reports })
        : { verdict: 'TOO_EARLY', change: null }
      return { step, verdict: j.verdict, change: j.change }
    })
    void syncChecks(computeChecks({ products, summaries, rows, reports, competitor, steps: judged, shop, now: Date.now() }))

    // Activated seller (section 10): onboarded, and a product with a report or an order count.
    const hasReportProduct = products.some((p) => linkFor(p, links))
    if (hasReportProduct || products.some((p) => p.ordersPerWeek !== undefined)) void track('activated')
  }, [snap])

  useEffect(() => {
    void flush()
    const onOnline = () => void flush()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])
}

/** Active checks, for the nav badge. */
export function useActiveCheckCount(): number {
  return useLiveQuery(() => db.checks.where('status').equals('active').count(), []) ?? 0
}
