import type { CostLineKey, FloorResult } from '../engine/floor'
import { inr, units } from '../engine/format'
import { useI18n, type TranslationKey } from '../i18n'
import { Card, CardTitle } from './Card'
import {
  InfoButton,
  WorkingPanel,
  useWorkingDisclosure,
  type WorkingStep,
} from './ShowWorking'

/**
 * Spec section 9.2: "the seven cost lines with the working column, total,
 * ÷ clean sales, + COGS = floor. (This must reproduce the deck table for the
 * default kurti.)"
 *
 * No rules or borders anywhere — the design system forbids them — so rows are
 * separated by zebra fills and the summary block by a different fill.
 */

/** Why each line exists and where its rate comes from, for the row's ⓘ panel. */
const LINE_NOTES: Record<CostLineKey, { why: string; source: string }> = {
  forward: {
    why: 'Paid on every order you dispatch, including the ones that come straight back. This is the single biggest overhead line for a cheap product.',
    source: 'Valmo DICE data pack (0–500 g slab); heavier slabs are ASSUMPTIONS',
  },
  reverse: {
    why: 'Paid on anything that travels back to you: RTO orders the buyer refused, plus returns after delivery. Reverse shipping costs more than forward.',
    source: 'Valmo DICE data pack (0–500 g slab); heavier slabs are ASSUMPTIONS',
  },
  gst: {
    why: 'GST applies to the forward shipping leg only in this model.',
    source: 'ASSUMPTION, matches the deck',
  },
  packaging: {
    why: 'Polybag, tape and label on every order you pack, whether or not it sticks.',
    source: 'ASSUMPTION (per category)',
  },
  cod: {
    why: 'A flat handling fee on the COD share of your orders. Meesho charges 0% commission, so flat fees like this are what actually eat a cheap product.',
    source: 'ASSUMPTION',
  },
  writeOff: {
    why: 'Returns that cannot be resold — damaged, worn, or opened. You lose the product itself, valued at your own cost.',
    source: 'Unsellable share per category; ethnic wear uses 6 of 13 returns from the deck',
  },
  ad: {
    why: 'Any ad spend you choose to attribute per order dispatched.',
    source: 'Seller input, default ₹0',
  },
}

interface CostTableProps {
  result: FloorResult
  /** The deck's exact worked example, when the inputs are still that kurti. */
  deck: FloorResult | null
}

interface RowProps {
  label: string
  working: string
  amount: string
  shade: boolean
  panelTitle: string
  steps: WorkingStep[]
  source?: string
  footer?: React.ReactNode
  emphasis?: 'none' | 'sum' | 'floor'
}

function Row({
  label,
  working,
  amount,
  shade,
  panelTitle,
  steps,
  source,
  footer,
  emphasis = 'none',
}: RowProps) {
  const [open, toggle, panelId] = useWorkingDisclosure()

  const fill =
    emphasis === 'floor' ? 'bg-plum text-white' : emphasis === 'sum' ? 'bg-peach' : shade ? 'bg-lilac/60' : ''
  const labelClass =
    emphasis === 'floor'
      ? 'font-bold text-white'
      : emphasis === 'sum'
        ? 'font-semibold text-plum-deep'
        : 'text-body'
  const amountClass =
    emphasis === 'floor'
      ? 'text-base font-bold text-orange'
      : emphasis === 'sum'
        ? 'font-bold text-plum-deep'
        : 'font-semibold text-plum-deep'

  return (
    <>
      <tr className={fill}>
        <th scope="row" className={`px-2 py-2 text-left text-xs font-normal align-top ${labelClass}`}>
          <span className="flex items-start gap-1.5">
            <span>{label}</span>
            <InfoButton
              open={open}
              onToggle={toggle}
              panelId={panelId}
              title={panelTitle}
              onDark={emphasis === 'floor'}
              className="mt-px"
            />
          </span>
        </th>
        <td
          className={`hidden px-2 py-2 text-left align-top font-mono text-[11px] sm:table-cell ${
            emphasis === 'floor' ? 'text-white/70' : 'text-body/70'
          }`}
        >
          {working}
        </td>
        <td className={`px-2 py-2 text-right align-top text-sm tabular-nums ${amountClass}`}>
          {amount}
          <span
            className={`block font-mono text-[10px] font-normal sm:hidden ${
              emphasis === 'floor' ? 'text-white/60' : 'text-body/60'
            }`}
          >
            {working}
          </span>
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={3} className="px-1 pb-2">
            <WorkingPanel id={panelId} title={panelTitle} steps={steps} source={source} footer={footer} />
          </td>
        </tr>
      ) : null}
    </>
  )
}

export function CostTable({ result, deck }: CostTableProps) {
  const { t } = useI18n()
  const cleanSales = units(result.cleanSales)

  return (
    <Card tone="white">
      <CardTitle hint={t('floor.costTableHint')}>{t('floor.costTable')}</CardTitle>

      <div className="-mx-2 overflow-x-auto">
        <table className="w-full table-auto">
          <caption className="sr-only">
            The seven overhead cost lines on 100 orders dispatched, with the working for each, the
            total, the overhead per clean sale and the resulting floor.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="px-2 pb-1 text-left text-[10px] font-semibold uppercase tracking-wide text-body/50">
                {t('cost.line')}
              </th>
              <th scope="col" className="hidden px-2 pb-1 text-left text-[10px] font-semibold uppercase tracking-wide text-body/50 sm:table-cell">
                {t('cost.working')}
              </th>
              <th scope="col" className="px-2 pb-1 text-right text-[10px] font-semibold uppercase tracking-wide text-body/50">
                {t('cost.on100')}
              </th>
            </tr>
          </thead>
          <tbody>
            {result.costLines.map((line, i) => (
              <Row
                key={line.key}
                label={t(line.labelKey as TranslationKey)}
                working={line.working}
                amount={inr(line.amount)}
                shade={i % 2 === 1}
                panelTitle={t(line.labelKey as TranslationKey).toLowerCase()}
                source={LINE_NOTES[line.key].source}
                steps={[
                  {
                    label: 'Cost on 100 orders dispatched',
                    formula: line.working,
                    value: inr(line.amount),
                    emphasis: true,
                  },
                  {
                    label: 'Per clean sale',
                    formula: `${inr(line.amount)} ÷ ${cleanSales} clean sales`,
                    value: inr(line.amount / result.cleanSales, 2),
                  },
                  { label: 'Why you pay it', note: LINE_NOTES[line.key].why },
                ]}
              />
            ))}

            <Row
              label={t('cost.total')}
              working={result.costLines.map((l) => inr(l.amount)).join(' + ')}
              amount={inr(result.totalOverhead)}
              shade={false}
              emphasis="sum"
              panelTitle="total overhead"
              steps={result.costLines.map((l) => ({
                label: l.label,
                formula: l.working,
                value: inr(l.amount),
              }))}
              footer={
                <p>
                  All seven lines are paid on orders that were dispatched — not on orders that
                  stuck. That is why the total has to be divided by clean sales, not by 100.
                </p>
              }
            />

            <Row
              label={t('cost.divide', { n: cleanSales })}
              working={`${inr(result.totalOverhead)} ÷ ${cleanSales}`}
              amount={inr(result.overheadPerCleanSale, 2)}
              shade={false}
              emphasis="sum"
              panelTitle="overhead per clean sale"
              steps={[
                {
                  label: 'Total overhead on 100 dispatched',
                  value: inr(result.totalOverhead),
                },
                {
                  label: 'Clean sales out of those 100',
                  formula: `100 − ${units(result.rtoUnits)} RTO − ${units(result.returnUnits)} returned`,
                  value: cleanSales,
                },
                {
                  label: 'Overhead each surviving sale must carry',
                  formula: `${inr(result.totalOverhead)} ÷ ${cleanSales}`,
                  value: inr(result.overheadPerCleanSale, 2),
                  emphasis: true,
                },
              ]}
            />

            <Row
              label={t('cost.plusCogs')}
              working={`your cost per unit`}
              amount={inr(result.input.cogs)}
              shade={false}
              emphasis="sum"
              panelTitle="product cost"
              steps={[
                {
                  label: 'What you pay your supplier per unit',
                  value: inr(result.input.cogs),
                  note: 'This is the only cost an offline seller usually counts.',
                },
              ]}
              source="Seller input"
            />

            <Row
              label={t('cost.equalsFloor')}
              working={`${inr(result.input.cogs)} + ${inr(result.overheadPerCleanSale, 2)}`}
              amount={inr(result.floor, 2)}
              shade={false}
              emphasis="floor"
              panelTitle="your true floor"
              steps={[
                {
                  label: 'Product cost',
                  value: inr(result.input.cogs),
                },
                {
                  label: 'Overhead per clean sale',
                  formula: `${inr(result.totalOverhead)} ÷ ${cleanSales}`,
                  value: inr(result.overheadPerCleanSale, 2),
                },
                {
                  label: 'Floor — sell below this and you lose money',
                  formula: `${inr(result.input.cogs)} + ${inr(result.overheadPerCleanSale, 2)}`,
                  value: inr(result.floor, 2),
                  emphasis: true,
                },
              ]}
              footer={
                deck ? (
                <div className="space-y-1">
                  <p className="font-semibold text-plum">Deck worked example, for comparison</p>
                  <p>
                    The deck uses rounded whole units — {units(deck.rtoUnits)} RTO,{' '}
                    {units(deck.returnUnits)} returned, {units(deck.writeOffUnits)} unsellable,{' '}
                    {units(deck.cleanSales)} clean sales — which gives{' '}
                    {inr(deck.totalOverhead)} ÷ {units(deck.cleanSales)} ={' '}
                    {inr(deck.overheadPerCleanSale)}, plus {inr(deck.input.cogs)} COGS ={' '}
                    <strong>{inr(deck.floor)}</strong>.
                  </p>
                  <table className="mt-1 w-full">
                    <tbody>
                      {deck.costLines.map((l, i) => (
                        <tr key={l.key} className={i % 2 === 1 ? 'bg-lilac/60' : ''}>
                          <td className="px-1 py-0.5 text-[11px]">{l.label}</td>
                          <td className="px-1 py-0.5 font-mono text-[10px] text-body/70">
                            {l.working}
                          </td>
                          <td className="px-1 py-0.5 text-right text-[11px] font-semibold tabular-nums">
                            {inr(l.amount)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-peach">
                        <td className="px-1 py-0.5 text-[11px] font-semibold">Total</td>
                        <td />
                        <td className="px-1 py-0.5 text-right text-[11px] font-bold tabular-nums">
                          {inr(deck.totalOverhead)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                ) : null
              }
            />
          </tbody>
        </table>
      </div>
    </Card>
  )
}
