/**
 * Competitor band statistics (spec section 6.3).
 *
 * This is the half of the problem Meesho's existing Recommended Price Range
 * tool already solves: where does the market sit? Sahi Daam needs it to answer
 * the other half — is the seller's own floor even inside that market.
 *
 * The listings are synthetic sample data (spec section 5.5). Nothing is
 * scraped; in production these come from Meesho's similar-product search.
 *
 * Pure, framework-free. No React imports.
 */
import { type Listing, listingsFor } from '../data'

export interface BandStats {
  p10: number
  p25: number
  /** The launch target (spec section 6.4): cheap enough to be seen. */
  p30: number
  p50: number
  p75: number
  /** NOT_VIABLE is judged against this (spec section 6.2). */
  p90: number
  min: number
  max: number
  count: number
}

export interface Band extends BandStats {
  categoryId: string
  /** Listing prices, ascending. */
  prices: number[]
  /** Listings, ascending by price — what the Screen 2 dot plot draws. */
  listings: Listing[]
  /** Always true for the prototype; the UI must say so. */
  synthetic: boolean
}

/**
 * The q-th quantile (0..1) of an ascending array, interpolating between the two
 * closest ranks — the same definition `percentileOf` inverts.
 */
export function quantile(sortedAsc: number[], q: number): number {
  const n = sortedAsc.length
  if (n === 0) return Number.NaN
  if (n === 1) return sortedAsc[0]!
  const clamped = Math.min(1, Math.max(0, q))
  const pos = clamped * (n - 1)
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sortedAsc[lo]!
  const frac = pos - lo
  return sortedAsc[lo]! + (sortedAsc[hi]! - sortedAsc[lo]!) * frac
}

/** The six percentiles plus min, max and count, from any list of prices. */
export function bandStats(prices: number[]): BandStats {
  const sorted = [...prices].sort((a, b) => a - b)
  return {
    p10: quantile(sorted, 0.1),
    p25: quantile(sorted, 0.25),
    p30: quantile(sorted, 0.3),
    p50: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    min: sorted[0] ?? Number.NaN,
    max: sorted[sorted.length - 1] ?? Number.NaN,
    count: sorted.length,
  }
}

/**
 * A band from an arbitrary set of listings.
 *
 * The market is not fixed: the journey's week-12 event drops the five nearest
 * listings by 10%, and Screen 4's "Fire T3" does the same on demand. Both need
 * a band built from modified listings rather than from the file.
 */
export function bandFromListings(
  categoryId: string,
  listings: Listing[],
  synthetic = true,
): Band {
  const sorted = [...listings].sort((a, b) => a.price - b.price)
  const prices = sorted.map((l) => l.price)
  return { ...bandStats(prices), categoryId, prices, listings: sorted, synthetic }
}

/** The band for a category, from its synthetic listings file. */
export function bandFor(categoryId: string): Band {
  const file = listingsFor(categoryId)
  return bandFromListings(categoryId, file.listings, file.synthetic)
}

/**
 * The same band with the `howMany` listings nearest `price` cut by `by`.
 * This is the competitor-undercut event, as a function.
 */
export function withUndercut(band: Band, price: number, by = 0.1, howMany = 5): Band {
  const targets = new Set(nearestListings(band, price, howMany).map((l) => l.id))
  return bandFromListings(
    band.categoryId,
    band.listings.map((l) =>
      targets.has(l.id) ? { ...l, price: Math.max(1, Math.round(l.price * (1 - by))) } : l,
    ),
    band.synthetic,
  )
}

/**
 * Where a price sits in the band, 0–100.
 *
 * This inverts `quantile`, so `percentileOf(band, band.p50)` comes back as 50 —
 * but only where the prices around that point are strictly increasing. Listing
 * prices are whole rupees, so ties happen; `quantile` is then a step function
 * with a flat, and a flat has no unique inverse. On a tie this returns the
 * FIRST matching rank, which is the conventional choice and keeps the result
 * monotonic in price.
 *
 * Below every listing is 0; above every listing is 100.
 */
export function percentileOf(band: Pick<Band, 'prices'>, price: number): number {
  const prices = band.prices
  const n = prices.length
  if (n === 0) return Number.NaN
  if (n === 1) return price < prices[0]! ? 0 : price > prices[0]! ? 100 : 50
  if (price <= prices[0]!) return 0
  if (price >= prices[n - 1]!) return 100

  // First index whose price is >= the target.
  let hi = 0
  while (hi < n && prices[hi]! < price) hi += 1

  if (prices[hi] === price) return (hi / (n - 1)) * 100

  const a = prices[hi - 1]!
  const b = prices[hi]!
  const frac = b === a ? 0 : (price - a) / (b - a)
  return ((hi - 1 + frac) / (n - 1)) * 100
}

/**
 * The five listings closest in price to a given price — what trigger T3 watches
 * for an undercut, and what Screen 2 highlights around the seller's marker.
 */
export function nearestListings(band: Band, price: number, howMany = 5): Listing[] {
  return [...band.listings]
    .sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price))
    .slice(0, howMany)
    .sort((a, b) => a.price - b.price)
}

/** The median of the five closest listings — trigger T3's comparison value. */
export function nearestMedian(band: Band, price: number, howMany = 5): number {
  const near = nearestListings(band, price, howMany).map((l) => l.price)
  return quantile(near, 0.5)
}
