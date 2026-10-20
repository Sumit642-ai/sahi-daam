/**
 * Every write the app makes, in one place. Each function takes the database
 * as an argument (the app's singleton by default) so tests can use a fresh one.
 */
import { DEFAULT_SHOP } from '../engine/keep'
import type { CheckCandidate } from './lib/checks'
import { rates } from '../data/rates'
import {
  type Competitor,
  type Lang,
  type PriceHistory,
  type Product,
  type SahiDaamDb,
  type Shop,
  SHOP_ID,
  db as appDb,
  newId,
} from './db'

export const DEFAULT_CATEGORY = 'ethnic_women'

export function newShop(language: Lang = 'en', now = Date.now()): Shop {
  return {
    id: SHOP_ID,
    name: '',
    category: DEFAULT_CATEGORY,
    gstRegistered: rates.gstRegisteredDefault,
    gstRate: null,
    buyerRegion: DEFAULT_SHOP.buyerRegion,
    prepaidDiscount: DEFAULT_SHOP.prepaidDiscount,
    language,
    shareOptIn: false,
    createdAt: now,
  }
}

export function getShop(db: SahiDaamDb = appDb): Promise<Shop | undefined> {
  return db.shop.get(SHOP_ID)
}

/**
 * Asks the browser to keep our storage through phone storage pressure, once,
 * on the first save (spec section 9). The answer is remembered on the shop.
 */
export async function requestPersistOnce(db: SahiDaamDb = appDb): Promise<boolean | null> {
  const shop = await getShop(db)
  if (shop && shop.storagePersisted !== undefined) return shop.storagePersisted
  let result: boolean | null = null
  try {
    const storage = globalThis.navigator?.storage
    if (storage && typeof storage.persist === 'function') result = await storage.persist()
  } catch {
    result = null
  }
  if (shop) await db.shop.update(SHOP_ID, { storagePersisted: result })
  return result
}

/** Merge answers into the shop, creating it if needed (onboarding autosaves every answer). */
export async function saveShop(patch: Partial<Omit<Shop, 'id'>>, db: SahiDaamDb = appDb): Promise<Shop> {
  const next = await db.transaction('rw', db.shop, async () => {
    const current = (await db.shop.get(SHOP_ID)) ?? newShop(patch.language ?? 'en')
    const merged: Shop = { ...current, ...patch, id: SHOP_ID }
    await db.shop.put(merged)
    return merged
  })
  await requestPersistOnce(db)
  return next
}

export type ProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>

export async function addProduct(
  input: ProductInput,
  db: SahiDaamDb = appDb,
  now = Date.now(),
): Promise<Product> {
  const product: Product = { ...stripUndefined(input), id: newId(), createdAt: now, updatedAt: now }
  await db.products.add(product)
  await requestPersistOnce(db)
  return product
}

/** Saves an edit; a price change is recorded in price history. */
export async function updateProduct(
  id: string,
  input: ProductInput,
  db: SahiDaamDb = appDb,
  now = Date.now(),
): Promise<Product> {
  return db.transaction('rw', db.products, db.priceHistory, async () => {
    const current = await db.products.get(id)
    if (!current) throw new Error(`No product ${id}`)
    const next: Product = {
      // Fields the form doesn't edit survive an edit.
      ...(current.stageOverride ? { stageOverride: current.stageOverride } : {}),
      ...(current.priceSetAt !== undefined ? { priceSetAt: current.priceSetAt } : {}),
      ...stripUndefined(input),
      id,
      createdAt: current.createdAt,
      updatedAt: now,
    }
    if (current.price !== input.price) next.priceSetAt = now
    if (current.cost !== input.cost) next.costChange = { from: current.cost, at: now }
    else if (current.costChange) next.costChange = current.costChange
    await db.products.put(next)
    if (current.price !== next.price) {
      await db.priceHistory.add({
        id: newId(),
        productId: id,
        oldPrice: current.price,
        newPrice: next.price,
        source: 'edit',
        at: now,
      })
    }
    return next
  })
}

/** What a delete removed, so the undo toast can put it all back. */
export interface DeletedProduct {
  product: Product
  history: PriceHistory[]
  competitor: Competitor[]
}

export async function deleteProduct(id: string, db: SahiDaamDb = appDb): Promise<DeletedProduct | null> {
  return db.transaction('rw', db.products, db.priceHistory, db.competitor, async () => {
    const product = await db.products.get(id)
    if (!product) return null
    const history = await db.priceHistory.where('productId').equals(id).toArray()
    const competitor = await db.competitor.where('productId').equals(id).toArray()
    await db.priceHistory.where('productId').equals(id).delete()
    await db.competitor.where('productId').equals(id).delete()
    await db.products.delete(id)
    return { product, history, competitor }
  })
}

export async function restoreProduct(deleted: DeletedProduct, db: SahiDaamDb = appDb): Promise<void> {
  await db.transaction('rw', db.products, db.priceHistory, db.competitor, async () => {
    await db.products.put(deleted.product)
    if (deleted.history.length > 0) await db.priceHistory.bulkPut(deleted.history)
    if (deleted.competitor.length > 0) await db.competitor.bulkPut(deleted.competitor)
  })
}

/** What "Use this price" changed, so its 10-second Undo can put it back (spec 8.2). */
export interface PriceChange {
  productId: string
  oldPrice: number
  oldPriceSetAt: number | undefined
  historyId: string
}

export async function setPrice(
  productId: string,
  newPrice: number,
  source: PriceHistory['source'] = 'priceHelper',
  db: SahiDaamDb = appDb,
  now = Date.now(),
): Promise<PriceChange> {
  return db.transaction('rw', db.products, db.priceHistory, async () => {
    const p = await db.products.get(productId)
    if (!p) throw new Error(`No product ${productId}`)
    const historyId = newId()
    await db.priceHistory.add({ id: historyId, productId, oldPrice: p.price, newPrice, source, at: now })
    await db.products.update(productId, { price: newPrice, priceSetAt: now, updatedAt: now })
    return { productId, oldPrice: p.price, oldPriceSetAt: p.priceSetAt, historyId }
  })
}

/** Undo: old price back, history entry removed. */
export async function undoPrice(change: PriceChange, db: SahiDaamDb = appDb): Promise<void> {
  await db.transaction('rw', db.products, db.priceHistory, async () => {
    const p = await db.products.get(change.productId)
    if (!p) return
    const restored: Product = { ...p, price: change.oldPrice, updatedAt: Date.now() }
    if (change.oldPriceSetAt === undefined) delete restored.priceSetAt
    else restored.priceSetAt = change.oldPriceSetAt
    await db.products.put(restored)
    await db.priceHistory.delete(change.historyId)
  })
}

/** The similar-product prices the seller typed for one product (one record per product). */
export async function saveCompetitorPrices(productId: string, prices: number[], db: SahiDaamDb = appDb): Promise<void> {
  await db.competitor.put({ id: productId, productId, prices, enteredAt: Date.now() })
}

/** Adds one price; read and written in one transaction, so quick taps never lose a price. */
export async function addCompetitorPrice(productId: string, price: number, max: number, db: SahiDaamDb = appDb): Promise<boolean> {
  return db.transaction('rw', db.competitor, async () => {
    const prices = (await db.competitor.get(productId))?.prices ?? []
    if (prices.length >= max) return false
    await db.competitor.put({ id: productId, productId, prices: [...prices, price], enteredAt: Date.now() })
    return true
  })
}

export async function removeCompetitorPrice(productId: string, index: number, db: SahiDaamDb = appDb): Promise<void> {
  await db.transaction('rw', db.competitor, async () => {
    const prices = (await db.competitor.get(productId))?.prices ?? []
    await db.competitor.put({ id: productId, productId, prices: prices.filter((_, i) => i !== index), enteredAt: Date.now() })
  })
}

export async function setStageOverride(productId: string, stage: Product['stageOverride'] | null, db: SahiDaamDb = appDb): Promise<void> {
  const p = await db.products.get(productId)
  if (!p) return
  const next: Product = { ...p }
  if (stage) next.stageOverride = stage
  else delete next.stageOverride
  await db.products.put(next)
}

/** Optional fields left blank are dropped rather than stored as undefined. */
function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}

// ------------------------------------------------------------------ checks

/**
 * Writes the difference between the checks that should show now and what's
 * stored (spec 7.8):
 *   - a new key is added as active, closing any older active check for the
 *     same rule and product (one active per rule and product)
 *   - an active check whose facts are gone is closed ('done')
 *   - a dismissed check stays dismissed while its key is the same
 *   - a closed check whose facts come back is shown again
 */
export async function syncChecks(candidates: CheckCandidate[], db: SahiDaamDb = appDb, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.checks, async () => {
    const existing = await db.checks.toArray()
    const byId = new Map(existing.map((c) => [c.id, c]))
    const keys = new Set(candidates.map((c) => c.key))
    for (const c of existing) {
      if (c.status === 'active' && !keys.has(c.id)) await db.checks.update(c.id, { status: 'done' })
    }
    for (const cand of candidates) {
      const found = byId.get(cand.key)
      if (found?.status === 'dismissed' || found?.status === 'active') continue
      for (const c of existing) {
        if (c.status === 'active' && c.rule === cand.rule && c.productId === cand.productId && c.id !== cand.key) {
          await db.checks.update(c.id, { status: 'done' })
        }
      }
      await db.checks.put({
        id: cand.key,
        rule: cand.rule,
        ...(cand.productId ? { productId: cand.productId } : {}),
        payload: cand.payload,
        status: 'active',
        createdAt: found?.createdAt ?? now,
      })
    }
  })
}

export async function dismissCheck(id: string, db: SahiDaamDb = appDb): Promise<void> {
  await db.checks.update(id, { status: 'dismissed' })
}

// ------------------------------------------------------------- price steps

/** "Try ₹10 more" (spec 7.9): applies the new price and starts a step to judge. */
export async function startPriceStep(
  productId: string,
  newPrice: number,
  db: SahiDaamDb = appDb,
  now = Date.now(),
): Promise<{ change: PriceChange; stepId: string }> {
  const change = await setPrice(productId, newPrice, 'priceHelper', db, now)
  const stepId = newId()
  await db.priceSteps.add({ id: stepId, productId, oldPrice: change.oldPrice, newPrice, startAt: now })
  return { change, stepId }
}

/** Undo for "Try ₹10 more": old price back and the step removed. */
export async function undoPriceStep(started: { change: PriceChange; stepId: string }, db: SahiDaamDb = appDb): Promise<void> {
  await undoPrice(started.change, db)
  await db.priceSteps.delete(started.stepId)
}

/** Closes a step: Keep (price stays), Go back (old price restored), or Stop (no verdict). */
export async function closePriceStep(
  stepId: string,
  verdict: 'KEEP' | 'GO_BACK' | 'TOO_EARLY',
  db: SahiDaamDb = appDb,
  now = Date.now(),
): Promise<PriceChange | null> {
  const step = await db.priceSteps.get(stepId)
  if (!step) return null
  let change: PriceChange | null = null
  if (verdict === 'GO_BACK') change = await setPrice(step.productId, step.oldPrice, 'priceHelper', db, now)
  await db.priceSteps.update(stepId, { judgedAt: now, verdict })
  return change
}
