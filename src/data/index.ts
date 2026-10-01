/**
 * Typed access to the JSON config in src/data.
 *
 * Every config value in the JSON is wrapped as { value, unit, label_*, source }
 * so Screen 6 (Assumptions & sources, spec section 9.7) can render the source of
 * every number. The engine wants plain numbers, so this module exposes both:
 *
 *   - `fees`, `categories`, `season` ... unwrapped, plain values for the engine
 *   - `sourcedEntries()`              ... a flat list of every value + its source
 *
 * No React here; the engine imports this freely.
 */
import feesJson from './fees.json'
import weightSlabsJson from './weightSlabs.json'
import categoriesJson from './categories.json'
import seasonJson from './season.json'
import journeyJson from './journey.json'

import ethnicWomenListings from './listings/ethnic_women.json'
import westernWomenListings from './listings/western_women.json'
import menApparelListings from './listings/men_apparel.json'
import kidsListings from './listings/kids.json'
import footwearListings from './listings/footwear.json'
import homeKitchenListings from './listings/home_kitchen.json'
import beautyListings from './listings/beauty.json'
import jewelleryListings from './listings/jewellery.json'

export interface Sourced<T> {
  value: T
  unit: string
  label_en: string
  label_hi: string
  source: string
}

export const ASSUMPTION = 'ASSUMPTION'

/** True when a source string marks the value as a placeholder, not a citation. */
export function isAssumption(source: string): boolean {
  return source.toUpperCase().includes(ASSUMPTION)
}

// ---------------------------------------------------------------- fees (5.1)

export interface Fees {
  codShare: number
  rtoCod: number
  rtoPrepaid: number
  codFee: number
  gstRate: number
  unitsBasis: number
}

export const fees: Fees = {
  codShare: feesJson.codShare.value,
  rtoCod: feesJson.rtoCod.value,
  rtoPrepaid: feesJson.rtoPrepaid.value,
  codFee: feesJson.codFee.value,
  gstRate: feesJson.gstRate.value,
  unitsBasis: feesJson.unitsBasis.value,
}

export const feesRaw = feesJson

// --------------------------------------------------------- weight slabs (5.2)

export interface WeightSlab {
  id: string
  label_en: string
  label_hi: string
  minG: number
  maxG: number
  forward: number
  reverse: number
  source: string
}

export const weightSlabs: WeightSlab[] = weightSlabsJson.slabs
export const weightSlabExtraStep = weightSlabsJson.extraStep
export const weightSlabsRaw = weightSlabsJson

// ----------------------------------------------------------- categories (5.3)

export interface Category {
  id: string
  name_en: string
  name_hi: string
  defaultWeightG: number
  packagingCost: number
  returnRateLow: number
  returnRateExpected: number
  returnRateHigh: number
  writeOffShare: number
  exampleCogs: number
  bandMedian: number
  bandSpread: number
  rtoNote: string
}

type RawCategory = (typeof categoriesJson.categories)[number]

function unwrapCategory(c: RawCategory): Category {
  return {
    id: c.id,
    name_en: c.name_en,
    name_hi: c.name_hi,
    defaultWeightG: c.defaultWeightG.value,
    packagingCost: c.packagingCost.value,
    returnRateLow: c.returnRateLow.value,
    returnRateExpected: c.returnRateExpected.value,
    returnRateHigh: c.returnRateHigh.value,
    writeOffShare: c.writeOffShare.value,
    exampleCogs: c.exampleCogs.value,
    bandMedian: c.bandMedian.value,
    bandSpread: c.bandSpread.value,
    rtoNote: c.rtoNote,
  }
}

/** The numeric fields of a category that carry their own source string. */
export type CategorySourcedField =
  | 'defaultWeightG'
  | 'packagingCost'
  | 'returnRateLow'
  | 'returnRateExpected'
  | 'returnRateHigh'
  | 'writeOffShare'
  | 'exampleCogs'
  | 'bandMedian'
  | 'bandSpread'

/**
 * The citation (or "ASSUMPTION") behind one category value. Screen 1 uses this
 * to decide whether a field is tagged "Meesho fills" or "Assumption", rather
 * than hard-coding which is which.
 */
export function categorySource(categoryId: string, field: CategorySourcedField): string {
  const raw = categoriesJson.categories.find((c) => c.id === categoryId)
  if (!raw) throw new Error(`Unknown categoryId "${categoryId}"`)
  return raw[field].source
}

export const categories: Category[] = categoriesJson.categories.map(unwrapCategory)
export const categoriesRaw = categoriesJson

const categoriesById = new Map(categories.map((c) => [c.id, c]))

/** Throws on an unknown id — a typo in a category id is a bug, not a fallback. */
export function getCategory(categoryId: string): Category {
  const found = categoriesById.get(categoryId)
  if (!found) {
    throw new Error(
      `Unknown categoryId "${categoryId}". Known ids: ${categories.map((c) => c.id).join(', ')}`,
    )
  }
  return found
}

// ------------------------------------------------------------- listings (5.5)

export interface Listing {
  id: string
  title: string
  price: number
  rating: number
  ratingCount: number
}

export interface ListingsFile {
  /** Always true. These are generated, never scraped. */
  synthetic: boolean
  categoryId: string
  count: number
  listings: Listing[]
  /** The UI must show this wording next to anything drawn from the listings. */
  _note: string
}

const LISTINGS: Record<string, ListingsFile> = {
  ethnic_women: ethnicWomenListings,
  western_women: westernWomenListings,
  men_apparel: menApparelListings,
  kids: kidsListings,
  footwear: footwearListings,
  home_kitchen: homeKitchenListings,
  beauty: beautyListings,
  jewellery: jewelleryListings,
}

/** The synthetic competitor listings for a category. Throws on an unknown id. */
export function listingsFor(categoryId: string): ListingsFile {
  const found = LISTINGS[categoryId]
  if (!found) {
    throw new Error(
      `No listings for categoryId "${categoryId}". Known ids: ${Object.keys(LISTINGS).join(', ')}`,
    )
  }
  return found
}

/** The label the UI must show wherever listing data appears (spec section 5.5). */
export const SYNTHETIC_LABEL =
  'Sample market data (synthetic) — in production this comes from Meesho’s similar-product search.'

// --------------------------------------------------------------- season (5.4)

export type MonthKey =
  | 'Jan' | 'Feb' | 'Mar' | 'Apr' | 'May' | 'Jun'
  | 'Jul' | 'Aug' | 'Sep' | 'Oct' | 'Nov' | 'Dec'

export interface SeasonMonth {
  key: MonthKey
  /** 0-based, so it lines up with Date.prototype.getMonth(). */
  monthIndex: number
  label_en: string
  label_hi: string
  index: number
  note: string
  source: string
}

export const seasonMonths: SeasonMonth[] = seasonJson.months.map((m) => ({
  key: m.key as MonthKey,
  monthIndex: m.monthIndex,
  label_en: m.label_en,
  label_hi: m.label_hi,
  index: m.index.value,
  note: m.note,
  source: m.index.source,
}))

export const seasonBaselineMonth = seasonJson.baseline.month as MonthKey
export const seasonMaxRto = seasonJson.maxRto.value
export const seasonRaw = seasonJson

// ----------------------------------------------- flat list for Screen 6 (9.7)

export interface SourcedEntry {
  group: string
  key: string
  label_en: string
  label_hi: string
  value: string | number
  unit: string
  source: string
  isAssumption: boolean
}

function entry(group: string, key: string, s: Sourced<string | number>): SourcedEntry {
  return {
    group,
    key,
    label_en: s.label_en,
    label_hi: s.label_hi,
    value: s.value,
    unit: s.unit,
    source: s.source,
    isAssumption: isAssumption(s.source),
  }
}

/**
 * Every config value with its source, flattened for the Assumptions screen.
 * Listings are excluded: they are generated sample data, labelled at file level.
 */
export function sourcedEntries(): SourcedEntry[] {
  const out: SourcedEntry[] = []

  for (const [key, s] of Object.entries(feesJson)) {
    if (key.startsWith('_')) continue
    out.push(entry('Fees & RTO', key, s as Sourced<number>))
  }

  for (const slab of weightSlabsJson.slabs) {
    out.push({
      group: 'Shipping slabs',
      key: `${slab.id}.forward`,
      label_en: `Forward shipping, ${slab.label_en}`,
      label_hi: `आगे की शिपिंग, ${slab.label_hi}`,
      value: slab.forward,
      unit: '₹ per order',
      source: slab.source,
      isAssumption: isAssumption(slab.source),
    })
    out.push({
      group: 'Shipping slabs',
      key: `${slab.id}.reverse`,
      label_en: `Reverse shipping, ${slab.label_en}`,
      label_hi: `वापसी की शिपिंग, ${slab.label_hi}`,
      value: slab.reverse,
      unit: '₹ per order',
      source: slab.source,
      isAssumption: isAssumption(slab.source),
    })
  }
  out.push({
    group: 'Shipping slabs',
    key: 'extraStep.forward',
    label_en: `Forward shipping, ${weightSlabExtraStep.label_en}`,
    label_hi: `आगे की शिपिंग, ${weightSlabExtraStep.label_hi}`,
    value: weightSlabExtraStep.forward,
    unit: '₹ per order',
    source: weightSlabExtraStep.source,
    isAssumption: isAssumption(weightSlabExtraStep.source),
  })
  out.push({
    group: 'Shipping slabs',
    key: 'extraStep.reverse',
    label_en: `Reverse shipping, ${weightSlabExtraStep.label_en}`,
    label_hi: `वापसी की शिपिंग, ${weightSlabExtraStep.label_hi}`,
    value: weightSlabExtraStep.reverse,
    unit: '₹ per order',
    source: weightSlabExtraStep.source,
    isAssumption: isAssumption(weightSlabExtraStep.source),
  })

  for (const c of categoriesJson.categories) {
    for (const [key, s] of Object.entries(c)) {
      if (typeof s !== 'object' || s === null) continue
      out.push(entry(`Category — ${c.name_en}`, `${c.id}.${key}`, s as Sourced<number>))
    }
  }

  out.push(entry('Season (RTO index)', 'baseline.industryRtoPct', seasonJson.baseline.industryRtoPct))
  out.push(entry('Season (RTO index)', 'maxRto', seasonJson.maxRto))
  for (const m of seasonJson.months) {
    out.push(entry('Season (RTO index)', `${m.key}.index`, m.index))
  }

  // The 26-week journey: the product, the calendar, and the hidden demand model
  // the learner is not allowed to see. Listing the hidden block here is the
  // point — a judge should be able to read every assumption the simulation
  // rests on, including the ones the learner is kept away from.
  for (const [key, s] of Object.entries(journeyJson.product)) {
    if (typeof s !== 'object' || s === null) continue
    out.push(entry('Journey — product', key, s as Sourced<number>))
  }
  for (const [key, s] of Object.entries(journeyJson.calendar)) {
    if (typeof s !== 'object' || s === null) continue
    out.push(entry('Journey — calendar', key, s as Sourced<string | number>))
  }
  for (const [key, s] of Object.entries(journeyJson.hiddenDemand)) {
    if (key.startsWith('_') || typeof s !== 'object' || s === null) continue
    out.push(entry('Journey — hidden demand model', key, s as Sourced<number>))
  }

  // Synthetic listings: one row per category, recording the seed and the shape.
  for (const category of categoriesJson.categories) {
    out.push({
      group: 'Synthetic competitor listings',
      key: `${category.id}.listings`,
      label_en: `${category.name_en} — 40 generated listings`,
      label_hi: `${category.name_hi} — 40 बनाई गई लिस्टिंग`,
      value: `median ${category.bandMedian.value}, spread ±${Math.round(category.bandSpread.value * 100)}%`,
      unit: 'listings',
      source:
        'ASSUMPTION — synthetic sample data, generated from a fixed seed by scripts/generate-listings.mjs. Nothing is scraped; in production these come from Meesho’s similar-product search.',
      isAssumption: true,
    })
  }

  return out
}
