import type { Band } from '../engine/band'
import type { FloorRange } from '../engine/floor'
import { inr } from '../engine/format'
import type { Fix, VerdictResult } from '../engine/recommend'
import { Card, CardTitle } from './Card'
import { ShowWorking } from './ShowWorking'

/**
 * Spec section 9.3: "Why this product can't make money as listed" — the four
 * fixes from section 6.2, each showing the floor it would actually produce.
 *
 * The point of showing the recomputed floor on every fix is that "reduce your
 * costs" is useless advice. "A bundle of 2 takes your floor from ₹252 to ₹151"
 * is a decision the seller can act on this afternoon.
 */
interface NotViableCardProps {
  verdict: VerdictResult
  range: FloorRange
  band: Band
}

function FixRow({ fix, band, currentFloor }: { fix: Fix; band: Band; currentFloor: number }) {
  const saving = Math.abs(fix.delta)
  return (
    <li className="rounded-card bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-semibold text-plum-deep">{fix.label}</span>
        <span className="flex items-baseline gap-2">
          <span className="text-[11px] text-body/50 line-through">{inr(currentFloor)}</span>
          <span className="text-lg font-bold tabular-nums text-orange">{inr(fix.newFloor)}</span>
        </span>
      </div>

      <p className="mt-1 text-[11px] leading-snug text-body">{fix.detail}</p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-profit/15 px-2 py-0.5 text-[10px] font-semibold text-profit">
          floor down {inr(saving)}
        </span>
        {fix.viableNow ? (
          <span className="rounded-full bg-profit/15 px-2 py-0.5 text-[10px] font-semibold text-profit">
            viable on its own
          </span>
        ) : (
          <span className="rounded-full bg-magenta/10 px-2 py-0.5 text-[10px] font-semibold text-magenta">
            still above {inr(band.p90)} — needs another fix too
          </span>
        )}
      </div>

      {fix.caveat ? (
        <p className="mt-1.5 text-[11px] leading-snug text-body/60">
          <span className="font-semibold">Caveat.</span> {fix.caveat}
        </p>
      ) : null}

      <ShowWorking
        className="mt-2"
        title={`the ${fix.label.toLowerCase()} fix`}
        steps={[
          { label: 'Your floor as listed today', value: inr(currentFloor, 2) },
          { label: 'What this fix changes', note: fix.detail },
          {
            label: 'Floor after the fix',
            value: inr(fix.newFloor, 2),
            emphasis: true,
          },
          {
            label: 'Difference',
            formula: `${inr(fix.newFloor, 2)} − ${inr(currentFloor, 2)}`,
            value: inr(fix.delta, 2),
          },
          {
            label: 'Does that clear the market?',
            formula: `${inr(fix.newFloor)} vs the 90th percentile of ${inr(band.p90)}`,
            value: fix.viableNow ? 'yes' : 'not on its own',
          },
          ...(fix.caveat ? [{ label: 'Caveat', note: fix.caveat }] : []),
        ]}
      />
    </li>
  )
}

export function NotViableCard({ verdict, range, band }: NotViableCardProps) {
  const anyAloneWorks = verdict.fixes.some((f) => f.viableNow)
  const best = [...verdict.fixes].sort((a, b) => a.newFloor - b.newFloor)[0]

  return (
    <Card tone="peach">
      <CardTitle
        tone="peach"
        hint="You can only break even above almost the whole market, where nobody will see you. The costs have to come down instead."
      >
        Why this product can&rsquo;t make money as listed
      </CardTitle>

      <p className="rounded-card bg-magenta/10 px-3 py-2 text-xs leading-relaxed text-body">
        {verdict.detail}
      </p>

      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-plum">
        Four things that would change it
      </p>
      <ul className="mt-2 space-y-2">
        {verdict.fixes.map((fix) => (
          <FixRow key={fix.id} fix={fix} band={band} currentFloor={range.expected} />
        ))}
      </ul>

      <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-[11px] leading-snug text-body">
        {anyAloneWorks && best ? (
          <>
            <span className="font-semibold text-plum">{best.label}</span> is the single biggest
            lever here — it takes your floor from {inr(range.expected)} to {inr(best.newFloor)}, back
            inside a market whose 90th percentile is {inr(band.p90)}. The fixes stack, so combining
            two gets you further still.
          </>
        ) : (
          <>
            No single fix is enough on its own: the best one,{' '}
            <span className="font-semibold text-plum">{best?.label}</span>, only reaches{' '}
            {inr(best?.newFloor ?? range.expected)} against a 90th percentile of {inr(band.p90)}.
            They stack, though — combining two or three is what gets this product into the market.
          </>
        )}
      </p>
    </Card>
  )
}
