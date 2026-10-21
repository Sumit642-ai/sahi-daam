/**
 * On-phone storage (MVP spec v2, section 9): IndexedDB through Dexie.
 *
 * Nothing here leaves the device. The raw report is never stored (Phase B
 * saves only per-product totals in `skuStats`).
 *
 * Schema changes add a new `this.version(n)` block with an upgrade function
 * and leave the old ones in place, so data saved by an older build always
 * migrates instead of crashing (spec 8.3, "old saved data after an update").
 */
import Dexie, { type Table } from 'dexie'

import type { BuyerRegion } from '../data/rates'

export type Lang = 'en' | 'hi'

export const SHOP_ID = 'main'

export interface Shop {
  id: typeof SHOP_ID
  name: string
  /** What the seller mostly sells; new products default to it. */
  category: string
  gstRegistered: boolean
  /** Output GST rate; null means the product category's default. */
  gstRate: number | null
  buyerRegion: BuyerRegion
  prepaidDiscount: boolean
  language: Lang
  shareOptIn: boolean
  createdAt: number
  /** Set when shop setup is finished; until then the app sends you to onboarding. */
  onboardedAt?: number
  /** Result of navigator.storage.persist(), asked once on the first save. */
  storagePersisted?: boolean | null
}

export interface Product {
  id: string
  name: string
  sku?: string
  category: string
  cost: number
  weightG: number
  price: number
  /** Shipping charge shown in the seller's panel, ₹ per order, incl. GST. */
  ship?: number
  /** Return charge, ₹ per customer return, incl. GST. */
  returnShip?: number
  packaging?: number
  adPerOrder?: number
  ordersPerWeek?: number
  stock?: number
  /** ISO date (yyyy-mm-dd). */
  listedSince?: string
  stageOverride?: 'LAUNCH' | 'GROWING' | 'STEADY' | 'CLEARING'
  /**
   * When the seller last set the price (form or price helper). A price set
   * after the latest report was uploaded beats the report's average price.
   */
  priceSetAt?: number
  /** The last cost change, for check C4 (cost changed more than 5%). */
  costChange?: { from: number; at: number }
  createdAt: number
  updatedAt: number
}

export interface PriceHistory {
  id: string
  productId: string
  oldPrice: number
  newPrice: number
  source: 'edit' | 'priceHelper' | 'report'
  at: number
}

export interface Competitor {
  id: string
  productId: string
  prices: number[]
  enteredAt: number
}

export interface Report {
  id: string
  /** SHA-256 of the file: the same file can't be uploaded twice. */
  fileHash: string
  fileName: string
  periodFrom?: string
  periodTo?: string
  /** Days covered, from the order dates; null when the file has none. */
  periodDays: number | null
  /** The saved column mapping used, or "auto" when every column was found. */
  mappingId?: string
  uploadedAt: number
  orderLines: number
  productCount: number
  /** Labelled SAMPLE / SYNTHETIC in the file: shown as a sample, never as real data. */
  synthetic: boolean
  /** The Ads sheet had no SKU, so ads were split across products by orders. */
  adsSplitByOrders: boolean
  /** Share of orders paid cash on delivery, from the payment-mode column; absent when the file has none. */
  codShare?: number
  /** Rows left out because their status wasn't final (in transit, shipped…), and which statuses. */
  ignoredRows?: number
  ignoredStatuses?: string[]
}

export interface Mapping {
  id: string
  columns: Record<string, string>
}

/**
 * One product's totals from one report: the only thing kept from a report
 * (spec section 9). No order lines, no buyer data.
 */
export interface SkuStatsRow {
  id: string
  reportId: string
  /** The matched product, or '' until the seller adds or links it. */
  productId: string
  /** As written in the report. Products match on it (case-insensitive). */
  sku: string
  productName: string
  /** Dispatched: delivered + returned + RTO. */
  orders: number
  /** Reached the buyer: kept + returned. */
  delivered: number
  deliveredKept: number
  rto: number
  returns: number
  cancelled: number
  avgPrice: number | null
  /** Forward shipping incl. GST per delivered order, ₹. */
  avgShip: number | null
  /** Return shipping incl. GST per customer return, ₹. */
  avgReturnShip: number | null
  forwardChargedOnRto: boolean
  /** Ads for this product over the report, ₹; null when the report has no Ads sheet. */
  ads: number | null
  /** Net penalties as a cost, ₹; null when the report has no Compensation sheet. */
  penalties: number | null
  tcsTds: number
  netSettlement: number
  /** Payout per delivered order with TCS / TDS added back, ₹. */
  avgSettlement: number | null
}

export interface Check {
  id: string
  rule: 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7'
  productId?: string
  payload: Record<string, unknown>
  status: 'active' | 'dismissed' | 'done'
  createdAt: number
}

export interface PriceStep {
  id: string
  productId: string
  oldPrice: number
  newPrice: number
  startAt: number
  judgedAt?: number
  verdict?: 'KEEP' | 'GO_BACK' | 'TOO_EARLY'
}

/** Device-level settings: anonymous id, team flag, referral codes, last backup. */
export interface KvRow {
  key: string
  value: unknown
}

/**
 * Anything waiting to be sent: anonymous events, waitlist and feedback
 * sign-ups, opt-in benchmark rows. Sent when online and a backend is
 * configured; kept on the phone otherwise (spec 8.3: counters queue).
 */
export interface OutboxRow {
  id: string
  kind: 'event' | 'waitlist' | 'feedback' | 'benchmark'
  payload: Record<string, unknown>
  at: number
}

export const DB_NAME = 'sahi-daam'

export class SahiDaamDb extends Dexie {
  shop!: Table<Shop, string>
  products!: Table<Product, string>
  priceHistory!: Table<PriceHistory, string>
  competitor!: Table<Competitor, string>
  reports!: Table<Report, string>
  mappings!: Table<Mapping, string>
  skuStats!: Table<SkuStatsRow, string>
  checks!: Table<Check, string>
  priceSteps!: Table<PriceStep, string>
  kv!: Table<KvRow, string>
  outbox!: Table<OutboxRow, string>

  constructor(name: string = DB_NAME) {
    super(name)
    this.version(1).stores({
      shop: 'id',
      products: 'id, updatedAt, category',
      priceHistory: 'id, productId, at',
      competitor: 'id, productId',
      reports: 'id, &fileHash, uploadedAt',
      mappings: 'id',
      skuStats: 'id, reportId, productId',
      checks: 'id, rule, productId, status',
      priceSteps: 'id, productId',
    })
    // v2 (Phase B): report totals are matched to products by SKU.
    this.version(2).stores({
      skuStats: 'id, reportId, productId, sku',
    })
    // v3 (Phase D): device settings and the send queue.
    this.version(3).stores({
      kv: 'key',
      outbox: 'id, kind, at',
    })
  }
}

export const db = new SahiDaamDb()

/** A random id. crypto.randomUUID needs a secure context, so plain-http LAN testing falls back. */
export function newId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') {
    try {
      return c.randomUUID()
    } catch {
      // fall through
    }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
