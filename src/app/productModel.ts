/**
 * Everything the floor card, price helper and sale check show for one
 * product, built in one place so the three screens always agree.
 */
import { useLiveQuery } from 'dexie-react-hooks'

import { type Market, type PriceRange, type Stage, STEP_JUDGE_DAYS, market, priceRange } from '../engine/priceHelper'
import type { StepJudgement } from '../engine/priceStep'
import { type PriceStep, type Product, type Report, type Shop, type SkuStatsRow, db } from './db'
import { useProduct, useReportLinks, useReports, useShop, useSkuStats } from './hooks'
import { type Action, whatToDo } from './lib/floorCard'
import { type ProductSummary, keepInputFor, linkFor, summarise } from './lib/products'
import { autoStage, listedSince, orderTrend } from './lib/stage'
import { judgeProductStep, openStep } from './lib/steps'
import type { ReportLink } from './report/store'

export interface ProductModel {
  product: Product
  shop: Shop
  summary: ProductSummary
  competitorPrices: number[]
  market: Market | null
  autoStage: Stage
  stage: Stage
  range: PriceRange
  actions: Action[]
  /** The price step being tried (spec 7.9), and how it stands. */
  step: { step: PriceStep; judgement: StepJudgement } | null
}

export function buildProductModel(args: {
  product: Product
  shop: Shop
  links: Map<string, ReportLink>
  rows: SkuStatsRow[]
  reports: Report[]
  competitorPrices: number[]
  /** When the price last changed (price history), if ever. */
  lastPriceChangeAt?: number | null
  steps?: PriceStep[]
  now?: number
}): ProductModel {
  const { product, shop, links, rows, reports, competitorPrices } = args
  const now = args.now ?? Date.now()
  const open = openStep(args.steps ?? [], product.id)
  const step = open
    ? { step: open, judgement: judgeProductStep({ step: open, sku: product.sku, base: keepInputFor(product, shop), rows, reports }) }
    : null
  // Hold Growing while a step is open or the price just changed: judge a step before the next.
  const recentStep = open !== null || (args.lastPriceChangeAt != null && now - args.lastPriceChangeAt < STEP_JUDGE_DAYS * 86_400_000)
  const summary = summarise(product, shop, linkFor(product, links))
  const m = competitorPrices.length > 0 ? market(competitorPrices) : null
  const auto = autoStage({
    since: listedSince(product, rows, reports),
    trend: orderTrend(product.sku, rows, reports),
    now,
  })
  const stage = product.stageOverride ?? auto
  const range = priceRange({ input: summary.input, currentPrice: summary.input.price, stage, market: m, recentStep })
  const actions = whatToDo({
    input: summary.input,
    categoryId: product.category,
    codHeavy: !shop.prepaidDiscount,
    recommendedPrice: range.viable ? range.target : null,
  })
  return { product, shop, summary, competitorPrices, market: m, autoStage: auto, stage, range, actions, step }
}

/** undefined while loading, null when the product doesn't exist. */
export function useProductModel(id: string | undefined): ProductModel | null | undefined {
  const product = useProduct(id)
  const shop = useShop()
  const links = useReportLinks()
  const rows = useSkuStats()
  const reports = useReports()
  const competitor = useLiveQuery(async () => (id ? ((await db.competitor.get(id)) ?? null) : null), [id])
  const lastChange = useLiveQuery(
    async () => (id ? ((await db.priceHistory.where('productId').equals(id).sortBy('at')).pop()?.at ?? null) : null),
    [id],
  )
  const steps = useLiveQuery(async () => (id ? db.priceSteps.where('productId').equals(id).toArray() : []), [id])

  if (product === null) return null
  if (
    product === undefined ||
    !shop ||
    links === undefined ||
    rows === undefined ||
    reports === undefined ||
    competitor === undefined ||
    lastChange === undefined ||
    steps === undefined
  ) {
    return undefined
  }
  return buildProductModel({
    product,
    shop,
    links,
    rows,
    reports,
    competitorPrices: competitor?.prices ?? [],
    lastPriceChangeAt: lastChange,
    steps,
  })
}
