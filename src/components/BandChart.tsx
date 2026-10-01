import type { Band } from '../engine/band'
import { percentileOf } from '../engine/band'
import type { FloorRange } from '../engine/floor'
import { inr } from '../engine/format'
import { ShowWorking } from './ShowWorking'

/**
 * Spec section 9.3's band chart: the synthetic listings as dots, p10–p90
 * shaded, the median marked, the floor as a magenta line, everything left of
 * the floor shaded "Loss on every order", and the seller's price marked.
 *
 * Laid out with CSS percentages rather than SVG. An SVG viewBox would scale its
 * own text down with the chart, and at 390 px the axis labels would be
 * unreadable — the one thing this chart cannot afford, since its whole job is
 * to put the floor and the market on the same ruler.
 */
interface BandChartProps {
  band: Band
  range: FloorRange
  /** The seller's current price marker. */
  price: number
}

/** Stable vertical jitter per listing, so dots do not jump on re-render. */
function jitterFor(id: string): number {
  let h = 2166136261
  for (const ch of id) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 1000) / 1000
}

export function BandChart({ band, range, price }: BandChartProps) {
  const floorExpected = range.expected

  // The domain has to hold the listings, the whole floor range and the price —
  // when a product is NOT_VIABLE the floor sits beyond every listing.
  //
  // It must not, however, be poisoned by an unreachable floor: if every order
  // comes back the floor is Infinity, and an infinite domain makes every
  // position NaN. Non-finite values are simply left out of the scale and their
  // markers pinned to the right-hand edge instead.
  const finite = (...values: number[]) => values.filter((v) => Number.isFinite(v))
  const floorIsReachable = Number.isFinite(floorExpected)
  const lo = Math.min(...finite(band.min, range.low, price, band.p50)) * 0.94
  const hi = Math.max(...finite(band.max, range.high, price, band.p50)) * 1.04
  const span = hi - lo || 1
  const at = (v: number) => (Number.isFinite(v) ? ((v - lo) / span) * 100 : 100)
  const clamp = (n: number) =>
    Number.isFinite(n) ? Math.round(Math.max(0, Math.min(100, n)) * 10) / 10 : 100

  const floorPct = clamp(at(floorExpected))
  const pricePct = clamp(at(price))
  const p10Pct = clamp(at(band.p10))
  const p90Pct = clamp(at(band.p90))
  const p50Pct = clamp(at(band.p50))
  const lowPct = clamp(at(range.low))
  const highPct = clamp(at(range.high))

  const belowFloor = band.listings.filter((l) => l.price < floorExpected).length
  const priceIsLoss = price < floorExpected

  return (
    <div>
      <div className="relative h-56 w-full overflow-hidden rounded-card bg-white">
        {/* p10–p90, the part of the market most buyers actually see. */}
        <div
          className="absolute inset-y-7 bottom-12 rounded-lg bg-lilac"
          style={{ left: `${p10Pct}%`, width: `${Math.max(0, p90Pct - p10Pct)}%` }}
        />

        {/*
          Loss zone — everything left of the floor loses money on every order.
          Drawn OVER the band, not under it: where the two overlap the seller
          needs to read "this part of the market is underwater", and a tint
          hidden behind the band says nothing.
        */}
        <div
          className="absolute inset-y-0 left-0 bg-magenta/[0.14]"
          style={{ width: `${floorPct}%` }}
        >
          {floorPct > 22 ? (
            <span className="absolute bottom-10 left-2 text-[10px] font-semibold uppercase leading-tight tracking-wide text-magenta">
              Loss on every
              <br />
              order
            </span>
          ) : null}
        </div>

        {/* The floor range itself, low to high return rate. */}
        <div
          className="absolute bottom-9 h-1.5 rounded-full bg-magenta/40"
          style={{ left: `${lowPct}%`, width: `${Math.max(0.6, highPct - lowPct)}%` }}
        />

        {/* Median. */}
        <div className="absolute inset-y-7 bottom-12 w-px bg-plum/40" style={{ left: `${p50Pct}%` }} />
        <span
          className={`absolute top-0.5 whitespace-nowrap text-[10px] font-medium text-plum/70 ${
            p50Pct > 80 ? '-translate-x-full' : p50Pct < 20 ? '' : '-translate-x-1/2'
          }`}
          style={{ left: `${p50Pct}%` }}
        >
          median {inr(band.p50)}
        </span>

        {/* Listing dots. */}
        {band.listings.map((listing) => {
          const x = clamp(at(listing.price))
          const y = 34 + jitterFor(listing.id) * 76
          const under = listing.price < floorExpected
          return (
            <span
              key={listing.id}
              title={`${listing.title} — ${inr(listing.price)} · ${listing.rating}★ (${listing.ratingCount})`}
              className={`absolute h-2 w-2 -translate-x-1/2 rounded-full ${
                under ? 'bg-magenta/50' : 'bg-plum/55'
              }`}
              style={{ left: `${x}%`, top: `${y}px` }}
            />
          )
        })}

        {/* The floor. */}
        <div
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-magenta"
          style={{ left: `${floorPct}%` }}
        />
        <span
          className={`absolute bottom-1 whitespace-nowrap rounded-full bg-magenta px-1.5 py-0.5 text-[10px] font-bold text-white ${
            floorPct > 80 ? '-translate-x-full' : floorPct < 20 ? '' : '-translate-x-1/2'
          }`}
          style={{ left: `${floorPct}%` }}
        >
          {floorIsReachable ? `floor ${inr(floorExpected)}` : 'no price works'}
        </span>

        {/* The seller's price. Its badge hugs whichever side keeps it off the
            floor badge when the two prices are only a few rupees apart. */}
        <div
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-orange"
          style={{ left: `${pricePct}%` }}
        />
        <span
          className={`absolute top-5 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white ${
            priceIsLoss ? 'bg-magenta' : 'bg-orange'
          } ${pricePct > 80 ? '-translate-x-full' : pricePct < 20 ? '' : '-translate-x-1/2'}`}
          style={{ left: `${pricePct}%` }}
        >
          you {inr(price)}
        </span>
      </div>

      <div className="mt-1 flex justify-between text-[10px] text-body/50">
        <span>{inr(lo)}</span>
        <span>
          {band.count} similar listings · p10 {inr(band.p10)} · p90 {inr(band.p90)}
        </span>
        <span>{inr(hi)}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-body/70">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-plum/55" /> competitor listing
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-3 rounded bg-lilac" /> p10–p90
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-0.5 bg-magenta" /> your floor
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-0.5 bg-orange" /> your price
        </span>
        <ShowWorking
          title="the competitor band"
          withLabel
          steps={[
            {
              label: 'Where the band comes from',
              note: `${band.count} synthetic listings for this category. In production these are the results of Meesho's similar-product search.`,
            },
            { label: 'Cheapest listing', value: inr(band.min) },
            { label: '10th percentile', value: inr(band.p10) },
            { label: '30th percentile — the launch target', value: inr(band.p30) },
            { label: 'Median (50th)', value: inr(band.p50), emphasis: true },
            { label: '75th percentile', value: inr(band.p75) },
            {
              label: '90th percentile — the viability test',
              value: inr(band.p90),
              note: 'If your floor is above this, no price in the band makes money.',
            },
            { label: 'Dearest listing', value: inr(band.max) },
            {
              label: 'Listings below your floor',
              formula: `${belowFloor} of ${band.count} listings are under ${inr(floorExpected)}`,
              value: `${Math.round((belowFloor / band.count) * 100)}%`,
              note: 'Sellers at those prices are losing money on every order — they just may not know it yet.',
            },
            {
              label: 'Where your price sits',
              formula: `${inr(price)} in a band from ${inr(band.min)} to ${inr(band.max)}`,
              value: `${Math.round(percentileOf(band, price))}th percentile`,
            },
          ]}
          source="Sample market data (synthetic) — see Screen 6"
        />
      </div>
    </div>
  )
}
