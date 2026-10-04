import type { FloorRange, FloorResult } from '../engine/floor'
import { keepPerCleanSale, profitPer100Dispatched } from '../engine/floor'
import { inr, pct, signedInr } from '../engine/format'
import { Card } from './Card'
import { useI18n } from '../i18n'
import { ShowWorking, type WorkingStep } from './ShowWorking'

/**
 * "You think you earn ₹(price − COGS). You actually keep ₹(price − floor)."
 * The floor is the seller floor — what the seller pays — so at ₹300 the
 * kurti's ₹150 is really about ₹29. Two enormous numbers side by side, the
 * second in magenta when it is a loss.
 */
interface ProfitStatPairProps {
  price: number
  cogs: number
  range: FloorRange
  deck: FloorResult | null
}

export function ProfitStatPair({ price, cogs, range, deck }: ProfitStatPairProps) {
  const { t } = useI18n()
  const imagined = price - cogs
  // GST-aware: a registered seller nets price ÷ 1.05 against the net floor.
  const actual = keepPerCleanSale(price, range.results.expected)
  const atLow = keepPerCleanSale(price, range.results.low)
  const atHigh = keepPerCleanSale(price, range.results.high)
  const perHundred = range.results.expected.viable
    ? range.results.expected.cleanSales * actual
    : profitPer100Dispatched(price, range.results.expected)
  const losing = actual < 0

  const steps: WorkingStep[] = [
    {
      label: 'What cost-plus pricing says you earn',
      formula: `${inr(price)} price − ${inr(cogs)} COGS`,
      value: signedInr(imagined),
      note: 'This is the number a seller carries over from the shop. It ignores every order that never became a clean sale.',
    },
    {
      label: 'What you actually keep per clean sale',
      formula: `${inr(price)} price − ${inr(range.expected, 2)} floor`,
      value: signedInr(actual, 2),
      emphasis: true,
    },
    {
      label: 'Across 100 orders dispatched',
      formula: `${range.results.expected.cleanSales.toFixed(1)} clean sales × ${signedInr(actual, 2)}`,
      value: signedInr(perHundred),
      note: 'Packaging was paid on all 100, and shipping on every order that went out to a buyer — not just on the ones that stuck.',
    },
    {
      label: `If returns come in low (${pct(range.returnRates.low, 0)})`,
      formula: `${inr(price)} − ${inr(range.low, 2)}`,
      value: signedInr(atLow, 2),
    },
    {
      label: `If returns come in high (${pct(range.returnRates.high, 0)})`,
      formula: `${inr(price)} − ${inr(range.high, 2)}`,
      value: signedInr(atHigh, 2),
    },
    {
      label: 'Margin on the list price',
      formula: `(${inr(price)} − ${inr(range.expected, 2)}) ÷ ${inr(price)}`,
      value: pct(actual / price),
    },
  ]

  return (
    <Card tone={losing ? 'peach' : 'lilac'}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-body/70">
            {t('floor.youThink')}
          </p>
          <p className="mt-1 text-4xl font-bold leading-none tracking-tight text-orange">
            {signedInr(imagined)}
          </p>
          <p className="mt-1 text-[11px] text-body/60">
            {inr(price)} − {inr(cogs)} cost
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-body/70">
            {t('floor.youActually')}
          </p>
          <p
            className={`mt-1 text-4xl font-bold leading-none tracking-tight ${
              losing ? 'text-magenta' : 'text-profit'
            }`}
          >
            {signedInr(actual)}
          </p>
          <p className="mt-1 text-[11px] text-body/60">
            {inr(price)} − {inr(range.expected)} your floor
          </p>
        </div>
      </div>

      <p className="mt-3 text-xs text-body/80">
        {losing ? (
          <>
            Every kurti you sell at {inr(price)} takes{' '}
            <span className="font-semibold text-magenta">{inr(Math.abs(actual))}</span> out of your
            pocket — {signedInr(perHundred)} across 100 orders dispatched.
          </>
        ) : (
          <>
            At {inr(price)} you clear{' '}
            <span className="font-semibold text-profit">{inr(actual)}</span> per sale, or{' '}
            {signedInr(perHundred)} across 100 orders dispatched.
          </>
        )}{' '}
        <span className="text-body/60">
          Range across your return rates: {signedInr(atHigh)} to {signedInr(atLow)}.
        </span>
      </p>

      <ShowWorking
        className="mt-2"
        title="What you actually keep"
        steps={steps}
        withLabel
        footer={
          deck ? (
            <p>
              <span className="font-semibold text-plum">At full cost-to-serve.</span> The
              deck&rsquo;s worked example charges every shipping leg on every order plus COD
              handling: {inr(deck.floor)}, so {inr(price)} − {inr(deck.floor)} ={' '}
              <strong className={price - deck.floor < 0 ? 'text-magenta' : 'text-profit'}>
                {signedInr(price - deck.floor)}
              </strong>{' '}
              per sale. That is what the order costs to serve. Meesho&rsquo;s supplier policy pays
              the RTO legs and COD handling, which is why what you keep is higher.
            </p>
          ) : null
        }
      />
    </Card>
  )
}
