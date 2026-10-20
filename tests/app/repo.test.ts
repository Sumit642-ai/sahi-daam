import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SHOP_ID, SahiDaamDb } from '../../src/app/db'
import {
  addProduct,
  deleteProduct,
  getShop,
  requestPersistOnce,
  restoreProduct,
  saveCompetitorPrices,
  saveShop,
  setPrice,
  setStageOverride,
  undoPrice,
  updateProduct,
  type ProductInput,
} from '../../src/app/repo'

let name = ''
let db: SahiDaamDb

const kurti: ProductInput = { name: 'Blue kurti', category: 'ethnic_women', cost: 150, weightG: 350, price: 300 }

beforeEach(async () => {
  name = `test-${Math.random().toString(36).slice(2)}`
  db = new SahiDaamDb(name)
  await db.open()
  vi.stubGlobal('navigator', { storage: { persist: vi.fn().mockResolvedValue(true) } })
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await db.delete()
})

/** Close and reopen under the same name: what a page reload does to IndexedDB. */
async function reload(): Promise<SahiDaamDb> {
  db.close()
  db = new SahiDaamDb(name)
  await db.open()
  return db
}

describe('schema (spec section 9)', () => {
  it('has every table of the data model', () => {
    expect(db.tables.map((t) => t.name).sort()).toEqual(
      ['checks', 'competitor', 'kv', 'mappings', 'outbox', 'priceHistory', 'priceSteps', 'products', 'reports', 'shop', 'skuStats'].sort(),
    )
  })

  it('is versioned, so later builds can migrate saved data', () => {
    expect(db.verno).toBe(3)
  })

  it('refuses the same report twice (unique file hash)', async () => {
    const report = (id: string) => ({
      id,
      fileHash: 'h1',
      fileName: 'r.xlsx',
      periodDays: 7,
      uploadedAt: 1,
      orderLines: 0,
      productCount: 0,
      synthetic: false,
      adsSplitByOrders: false,
    })
    await db.reports.add(report('a'))
    await expect(db.reports.add(report('b'))).rejects.toThrow()
  })
})

describe('shop', () => {
  it('is created on the first answer with GST-registered and mixed buyers by default', async () => {
    const shop = await saveShop({ language: 'hi' }, db)
    expect(shop).toMatchObject({
      id: SHOP_ID,
      language: 'hi',
      gstRegistered: true,
      buyerRegion: 'mixed',
      prepaidDiscount: false,
      shareOptIn: false,
      category: 'ethnic_women',
    })
    expect(shop.onboardedAt).toBeUndefined()
  })

  it('merges later answers and survives a reload', async () => {
    await saveShop({ language: 'hi' }, db)
    await saveShop({ buyerRegion: 'small_towns', gstRegistered: false }, db)
    await saveShop({ onboardedAt: 123 }, db)
    await reload()
    expect(await getShop(db)).toMatchObject({
      language: 'hi',
      buyerRegion: 'small_towns',
      gstRegistered: false,
      onboardedAt: 123,
    })
  })
})

describe('products', () => {
  it('saves, and is still there after a reload', async () => {
    const p = await addProduct({ ...kurti, ship: undefined, ordersPerWeek: 40 }, db, 1000)
    expect(p.id).toBeTruthy()
    await reload()
    const back = await db.products.get(p.id)
    expect(back).toEqual({ ...kurti, ordersPerWeek: 40, id: p.id, createdAt: 1000, updatedAt: 1000 })
    expect(back).not.toHaveProperty('ship')
  })

  it('records a price change in price history, and nothing for other edits', async () => {
    const p = await addProduct(kurti, db, 1000)
    await updateProduct(p.id, { ...kurti, name: 'Blue rayon kurti' }, db, 2000)
    expect(await db.priceHistory.count()).toBe(0)
    await updateProduct(p.id, { ...kurti, price: 330 }, db, 3000)
    const history = await db.priceHistory.toArray()
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ productId: p.id, oldPrice: 300, newPrice: 330, source: 'edit', at: 3000 })
    const saved = await db.products.get(p.id)
    expect(saved).toMatchObject({ price: 330, createdAt: 1000, updatedAt: 3000 })
  })

  it('delete, then undo, restores the product with its history (spec 8.2)', async () => {
    const p = await addProduct(kurti, db, 1000)
    await updateProduct(p.id, { ...kurti, price: 330 }, db, 2000)
    const deleted = await deleteProduct(p.id, db)
    expect(await db.products.count()).toBe(0)
    expect(await db.priceHistory.count()).toBe(0)

    await restoreProduct(deleted!, db)
    expect(await db.products.get(p.id)).toMatchObject({ price: 330, createdAt: 1000 })
    expect(await db.priceHistory.where('productId').equals(p.id).count()).toBe(1)
  })

  it('deleting a missing product is a no-op', async () => {
    expect(await deleteProduct('nope', db)).toBeNull()
  })
})

describe('navigator.storage.persist() on first save (spec section 9)', () => {
  it('asks once and remembers the answer', async () => {
    const persist = (globalThis.navigator as unknown as { storage: { persist: ReturnType<typeof vi.fn> } }).storage.persist
    await saveShop({ language: 'en' }, db)
    await addProduct(kurti, db)
    await addProduct(kurti, db)
    await saveShop({ buyerRegion: 'big_cities' }, db)
    expect(persist).toHaveBeenCalledTimes(1)
    expect((await getShop(db))!.storagePersisted).toBe(true)
  })

  it('records a refusal, so Me can warn the data may be cleared', async () => {
    vi.stubGlobal('navigator', { storage: { persist: vi.fn().mockResolvedValue(false) } })
    await saveShop({ language: 'en' }, db)
    expect((await getShop(db))!.storagePersisted).toBe(false)
  })

  it('copes with browsers that have no storage API', async () => {
    vi.stubGlobal('navigator', {})
    await saveShop({ language: 'en' }, db)
    expect(await requestPersistOnce(db)).toBeNull()
  })
})

describe('"Use this price" and its Undo (spec 7.6, 8.2)', () => {
  it('sets the price, stamps it, records history; Undo puts all of it back', async () => {
    const p = await addProduct(kurti, db, 1000)
    const change = await setPrice(p.id, 320, 'priceHelper', db, 5000)
    expect(await db.products.get(p.id)).toMatchObject({ price: 320, priceSetAt: 5000 })
    expect(await db.priceHistory.toArray()).toMatchObject([{ productId: p.id, oldPrice: 300, newPrice: 320, source: 'priceHelper', at: 5000 }])

    await undoPrice(change, db)
    const back = (await db.products.get(p.id))!
    expect(back.price).toBe(300)
    expect(back).not.toHaveProperty('priceSetAt')
    expect(await db.priceHistory.count()).toBe(0)
  })

  it('an edit that changes the price stamps it; other fields the form lacks survive', async () => {
    const p = await addProduct(kurti, db, 1000)
    await setStageOverride(p.id, 'CLEARING', db)
    await updateProduct(p.id, { ...kurti, name: 'Renamed' }, db, 2000)
    expect(await db.products.get(p.id)).toMatchObject({ stageOverride: 'CLEARING' })
    expect((await db.products.get(p.id))!.priceSetAt).toBeUndefined()
    await updateProduct(p.id, { ...kurti, price: 310 }, db, 3000)
    expect(await db.products.get(p.id)).toMatchObject({ price: 310, priceSetAt: 3000, stageOverride: 'CLEARING' })
    await setStageOverride(p.id, null, db)
    expect(await db.products.get(p.id)).not.toHaveProperty('stageOverride')
  })

  it('competitor prices are saved per product and survive delete + undo', async () => {
    const p = await addProduct(kurti, db)
    await saveCompetitorPrices(p.id, [280, 300, 320], db)
    expect((await db.competitor.get(p.id))!.prices).toEqual([280, 300, 320])
    const deleted = await deleteProduct(p.id, db)
    expect(await db.competitor.count()).toBe(0)
    await restoreProduct(deleted!, db)
    expect((await db.competitor.get(p.id))!.prices).toEqual([280, 300, 320])
  })
})
