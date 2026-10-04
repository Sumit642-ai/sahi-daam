import { useEffect, useMemo, useRef, useState } from 'react'

import { inr, pct, signedInr, units } from '../engine/format'
import { DEMO_PRODUCT, DEMO_SELLER, type Lang, sellerProduct } from '../engine/nudges'
import {
  type JourneyEvent,
  type StrategyId,
  STRATEGY_LABEL,
  runSimulation,
} from '../engine/simulator'
import type { Alert } from '../engine/triggers'
import { AlertBubble, PhoneFrame } from '../components/AlertPhone'
import { Card, CardTitle } from '../components/Card'
import {
  CumulativeProfitChart,
  PriceVsFloorChart,
  WeeklyProfitChart,
} from '../components/JourneyCharts'
import { ShowWorking } from '../components/ShowWorking'
import { useI18n } from '../i18n'

/**
 * Screen 3 — the seller journey.
 *
 * Twenty-six weeks of one kurti, played out three ways on the same world:
 * Sahi Daam, the seller's instinct, and following Meesho's similar-listing
 * range. The hero is Chart C — three cumulative-profit lines from the same ₹0
 * and the same stock, all measured on the seller floor. Every sentence on this
 * screen is computed from the run, so the copy cannot claim more than it shows.
 */

type View = StrategyId | 'both'

const STAGE_TONE: Record<string, string> = {
  LAUNCH: 'bg-plum/10 text-plum',
  RAMP: 'bg-orange/15 text-[#8A4408]',
  MATURE: 'bg-profit/15 text-profit',
  DECLINE: 'bg-magenta/10 text-magenta',
}

export function SellerJourney({ judgeMode }: { judgeMode: boolean }) {
  // One deterministic world, computed once.
  const sim = useMemo(() => runSimulation(), [])
  const totalWeeks = sim.sahiDaam.weeks.length

  const { t, lang: uiLang } = useI18n()
  // Opens on the finished story — both lines at week 26, the gap already
  // visible. Play and Reset replay it from week 1.
  const [week, setWeek] = useState(totalWeeks)
  const [view, setView] = useState<View>('both')
  const [playing, setPlaying] = useState(false)
  const lang: Lang = uiLang
  const [openAlert, setOpenAlert] = useState<Alert | null>(null)
  const [manualPrice, setManualPrice] = useState<number | null>(null)
  const timer = useRef<number | null>(null)

  // Play: the whole journey in about 35 seconds (spec section 11: under a minute).
  useEffect(() => {
    if (!playing) return
    timer.current = window.setInterval(() => {
      setWeek((w) => {
        if (w >= totalWeeks) {
          setPlaying(false)
          return w
        }
        return w + 1
      })
    }, 1_300)
    return () => {
      if (timer.current) window.clearInterval(timer.current)
    }
  }, [playing, totalWeeks])

  const sahiWeek = sim.sahiDaam.weeks[week - 1]!
  const instinctWeek = sim.sellerInstinct.weeks[week - 1]!
  const rangeWeek = sim.meeshoRange.weeks[week - 1]!
  const runs = { sahi_daam: sim.sahiDaam, seller_instinct: sim.sellerInstinct, meesho_range: sim.meeshoRange }
  const primary = view === 'both' ? sim.sahiDaam : runs[view]
  const primaryWeek = primary.weeks[week - 1]!
  const allRuns = [sim.sahiDaam, sim.sellerInstinct, sim.meeshoRange] as const
  /** First week a strategy had no stock left to sell, if it ever ran out. */
  const soldOutWeek = (run: typeof sim.sahiDaam) => run.weeks.find((w) => w.stockLeft <= 0.5)?.week
  const perUnit = (run: typeof sim.sahiDaam) => run.summary.totalProfit / run.summary.unitsSold
  /** First week from which Sahi Daam stays ahead of both baselines to the end. */
  const leadsFrom = (() => {
    let from: number | null = null
    for (const w of sim.sahiDaam.weeks) {
      const i = w.week - 1
      const ahead =
        w.cumulativeProfit >= sim.sellerInstinct.weeks[i]!.cumulativeProfit &&
        w.cumulativeProfit >= sim.meeshoRange.weeks[i]!.cumulativeProfit
      if (ahead && from === null) from = w.week
      if (!ahead) from = null
    }
    return from
  })()

  /** Scripted events and alerts up to this week, newest first. */
  const log = useMemo(() => {
    const rows: {
      week: number
      kind: 'event' | 'alert'
      title: string
      detail: string
      alert?: Alert
    }[] = []
    for (const event of sim.events as JourneyEvent[]) {
      if (event.week <= week) {
        rows.push({
          week: event.week,
          kind: 'event',
          title: event.title_en,
          detail: event.detail_en,
        })
      }
    }
    for (const row of sim.sahiDaam.weeks.slice(0, week)) {
      for (const alert of row.alerts) {
        rows.push({
          week: row.week,
          kind: 'alert',
          title: `${alert.id} · ${alert.title}`,
          detail: alert.action,
          alert,
        })
      }
    }
    return rows.sort((a, b) => b.week - a.week || (a.kind === 'event' ? -1 : 1))
  }, [sim, week])

  const learner = sim.sahiDaam.learner
  const stepsSoFar = sim.sahiDaam.learnerSteps.filter((s) => s.week <= week)
  // The estimate as it stood at this week — not the final one — so scrubbing
  // back to before the ramp shows nothing learned yet.
  const estimatesSoFar = stepsSoFar
    .map((s) => s.elasticity)
    .filter((e): e is number => e !== null)
  const learnedSoFar =
    estimatesSoFar.length > 0
      ? estimatesSoFar.reduce((sum, e) => sum + e, 0) / estimatesSoFar.length
      : null
  const finished = week >= totalWeeks

  const manualAlert = useMemo(() => {
    if (manualPrice === null) return null
    const profit = manualPrice - sahiWeek.floor
    return {
      price: manualPrice,
      floor: sahiWeek.floor,
      profit,
    }
  }, [manualPrice, sahiWeek.floor])

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-plum sm:text-3xl">
          {t('nav.journey')}{' '}
          <span className="text-base font-medium text-body/60">· {t('nav.journeySub')}</span>
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-body">
          The same product, the same market, the same 1,500 units of starting stock (plus one
          500-unit reorder) — priced three ways.
          Sahi Daam checks the floor every week and learns from its own price steps. Seller
          instinct lists at cost × 2 and matches the week-12 undercut. Meesho range lists at the
          middle of the similar-listing band every week. Profit is what the seller actually keeps,
          on the seller floor.
        </p>
      </div>

      {/* ------------------------------------------------------------ controls */}
      <Card tone="lilac">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="button"
            onClick={() => {
              if (!playing && finished) {
                setWeek(1)
                setManualPrice(null)
              }
              setPlaying((p) => !p)
            }}
            className="rounded-lg bg-plum px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-plum-deep"
          >
            {playing ? 'Pause' : finished ? 'Replay' : 'Play'}
          </button>
          <button
            type="button"
            onClick={() => {
              setPlaying(false)
              setWeek((w) => Math.min(totalWeeks, w + 1))
            }}
            disabled={finished}
            className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-plum transition-colors hover:bg-white/70 disabled:opacity-40"
          >
            Next week →
          </button>
          <button
            type="button"
            onClick={() => {
              setPlaying(false)
              setWeek(1)
              setManualPrice(null)
            }}
            className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-plum transition-colors hover:bg-white/70"
          >
            Reset
          </button>

          <label className="flex min-w-[12rem] flex-1 items-center gap-2">
            <span className="text-[11px] font-medium text-plum-deep">Jump to week</span>
            <input
              type="range"
              min={1}
              max={totalWeeks}
              value={week}
              onChange={(e) => {
                setPlaying(false)
                setWeek(Number(e.target.value))
              }}
              className="h-5 flex-1 cursor-pointer accent-orange"
            />
            <span className="w-6 text-right text-xs font-bold tabular-nums text-orange">{week}</span>
          </label>

          <div className="flex gap-1 rounded-full bg-white/70 p-0.5">
            {(['sahi_daam', 'seller_instinct', 'meesho_range', 'both'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  view === v ? 'bg-plum text-white' : 'text-plum'
                }`}
              >
                {v === 'both' ? 'All three' : STRATEGY_LABEL[v]}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setManualPrice(Math.round(sahiWeek.price * 0.85))}
            className="rounded-lg bg-magenta/10 px-3 py-2 text-xs font-semibold text-magenta transition-colors hover:bg-magenta/20"
          >
            Change price manually
          </button>
        </div>

        {manualAlert ? (
          <div className="mt-3 rounded-card bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-magenta">
              T6 · You changed your price
            </p>
            <p className="mt-1 text-xs text-body">
              You moved the price from {inr(sahiWeek.price)} to {inr(manualAlert.price)}. Your floor
              in week {week} is {inr(manualAlert.floor)}, so you would{' '}
              {manualAlert.profit < 0 ? (
                <>
                  lose <span className="font-bold text-magenta">{inr(-manualAlert.profit)}</span> on
                  every order.
                </>
              ) : (
                <>
                  still make <span className="font-bold text-profit">{inr(manualAlert.profit)}</span>{' '}
                  on every order.
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => setManualPrice(null)}
              className="mt-2 text-[11px] font-semibold text-plum underline"
            >
              Undo
            </button>
          </div>
        ) : null}
      </Card>

      {/* -------------------------------------------------------- status strip */}
      <Card tone="plum" className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
              {t('label.week')} {week} / {totalWeeks} · {primaryWeek.date}
            </p>
            <p className="mt-1 flex flex-wrap items-baseline gap-3">
              <span className="text-4xl font-bold leading-none text-orange">
                {inr(primaryWeek.price)}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STAGE_TONE[primaryWeek.stage]}`}
              >
                {t(`stage.${primaryWeek.stage}`)}
              </span>
              <span className="text-xs text-white/70">
                {STRATEGY_LABEL[primary.strategy]}
              </span>
            </p>
          </div>

          <dl className="flex flex-wrap gap-x-6 gap-y-2">
            {[
              { label: t('label.floor'), value: inr(primaryWeek.floor) },
              { label: t('label.percentile'), value: `${Math.round(primaryWeek.percentile)}` },
              { label: t('label.orders'), value: units(Math.round(primaryWeek.orders)) },
              { label: t('label.stockLeft'), value: units(Math.round(primaryWeek.stockLeft)) },
              {
                label: t('label.cumulative'),
                value: signedInr(primaryWeek.cumulativeProfit),
                tone: primaryWeek.cumulativeProfit >= 0 ? 'text-white' : 'text-magenta',
              },
            ].map((stat) => (
              <div key={stat.label}>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-white/60">
                  {stat.label}
                </dt>
                <dd className={`text-lg font-bold tabular-nums ${stat.tone ?? 'text-white'}`}>
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <ShowWorking
          className="mt-3"
          title={`week ${week}`}
          onDark
          withLabel
          steps={[
            { label: 'Stage', value: primaryWeek.stage },
            { label: 'Product cost this week', value: inr(primaryWeek.cogs) },
            {
              label: 'RTO season index',
              value: `×${primaryWeek.seasonIndex}`,
              note: primaryWeek.seasonIndex === 1 ? 'Baseline month.' : 'Festive lift on RTO.',
            },
            { label: 'Realised RTO', value: pct(primaryWeek.rtoPct) },
            { label: 'Realised return rate', value: pct(primaryWeek.returnPct) },
            {
              label: 'Floor at those realised rates',
              value: inr(primaryWeek.floor, 2),
            },
            {
              label: 'Clean sales this week',
              formula: `${units(Math.round(primaryWeek.orders))} orders × survival`,
              value: units(Math.round(primaryWeek.cleanSales)),
            },
            {
              label: 'Profit this week',
              formula: `${units(Math.round(primaryWeek.cleanSales))} × (${inr(primaryWeek.price)} − ${inr(primaryWeek.floor)})`,
              value: signedInr(primaryWeek.profit),
              emphasis: true,
            },
          ]}
        />
      </Card>

      {/* ----------------------------------------------------- Chart C, the hero */}
      <Card tone="white" className="mt-4">
        <CardTitle
          hint="Same product, same market, same 1,500 units of starting stock (plus one 500-unit reorder). The only difference is how each one priced."
          aside={
            <div className="flex gap-4 text-right">
              {(
                [
                  ['Sahi Daam', sahiWeek, 'text-profit'],
                  ['Seller instinct', instinctWeek, 'text-magenta'],
                  ['Meesho range', rangeWeek, 'text-orange'],
                ] as const
              ).map(([label, row, tone]) => (
                <div key={label}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-body/60">
                    {label}
                  </p>
                  <p className={`text-xl font-bold tabular-nums ${tone}`}>
                    {signedInr(row.cumulativeProfit)}
                  </p>
                </div>
              ))}
            </div>
          }
        >
          Cumulative profit
        </CardTitle>

        <CumulativeProfitChart
          sahiDaam={sim.sahiDaam}
          sellerInstinct={sim.sellerInstinct}
          meeshoRange={sim.meeshoRange}
          week={week}
        />

        <p className="mt-2 rounded-lg bg-peach px-3 py-2 text-xs text-body">
          The dashed lines mark weeks 16&ndash;21, the festive season. Measured on what the seller
          actually pays, all three strategies make money: Meesho pays the RTO shipping, so a ₹
          {Math.round(sim.sellerInstinct.weeks[0]!.price)} or ₹
          {Math.round(sim.meeshoRange.weeks[0]!.price)} kurti clears a ₹
          {Math.round(sim.sahiDaam.weeks[0]!.floor)} floor in a quiet week. What separates them is
          what each unit earns — Sahi Daam steps its price up through the ramp and carries its
          margin when the floor moves (the fabric rise in week 14, the size complaints in weeks
          16&ndash;18). It launches cheaper, at ₹{Math.round(sim.sahiDaam.weeks[0]!.price)}, so it
          trails at first
          {leadsFrom !== null ? <> and leads from week {leadsFrom} to the end</> : null}. The
          lines go flat when each one runs out of stock.{' '}
          <span className="font-semibold text-plum">
            Gap at week {week}: {inr(sahiWeek.cumulativeProfit - instinctWeek.cumulativeProfit)} over
            seller instinct, {inr(sahiWeek.cumulativeProfit - rangeWeek.cumulativeProfit)} over
            Meesho range.
          </span>
        </p>
      </Card>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        {/* ----------------------------------------------------------- Chart A */}
        <Card tone="white">
          <CardTitle hint={`${STRATEGY_LABEL[primary.strategy]} — price against the floor and the market.`}>
            Price vs floor vs band
          </CardTitle>
          <PriceVsFloorChart run={primary} week={week} />
          <p className="mt-1 text-[11px] text-body/60">
            Wherever the orange line sits below the magenta one, every order that week loses money.
          </p>
        </Card>

        {/* ----------------------------------------------------------- Chart B */}
        <Card tone="white">
          <CardTitle hint="Green weeks earn, magenta weeks lose.">Profit each week</CardTitle>
          <WeeklyProfitChart run={primary} week={week} />
          <p className="mt-1 text-[11px] text-body/60">
            {primary.summary.weeksBelowFloor === 0
              ? 'Not one week below the floor.'
              : `${primary.summary.weeksBelowFloor} of ${totalWeeks} weeks priced below the floor.`}
          </p>
        </Card>

        {/* ------------------------------------------------------ learner panel */}
        <Card tone="peach">
          <CardTitle
            tone="peach"
            hint="One ₹10–20 step a week during Ramp. Keep it if profit per 1,000 impressions improves more than 2%, revert if it falls."
            aside={
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-body/60">
                  Price sensitivity learned
                </p>
                <p className="text-lg font-bold tabular-nums text-plum-deep">
                  {learnedSoFar !== null ? learnedSoFar.toFixed(2) : '—'}
                </p>
                {judgeMode ? (
                  <p className="text-[10px] text-body/60">true value = {sim.hidden.epsilon}</p>
                ) : null}
              </div>
            }
          >
            What the price steps learned
          </CardTitle>

          {stepsSoFar.length === 0 ? (
            <p className="text-xs text-body/70">
              The ramp stage starts in week 4. Until then there is no price-vs-sales data to learn
              from — which is the whole problem Sahi Daam is built around.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {stepsSoFar.map((step) => (
                <li
                  key={step.week}
                  className={`rounded-lg px-3 py-2 ${step.kept ? 'bg-white/70' : 'bg-magenta/10'}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-xs font-semibold text-plum-deep">
                      Week {step.week}: {inr(step.fromPrice)} → {inr(step.toPrice)}
                    </span>
                    <span
                      className={`text-[11px] font-bold ${step.kept ? 'text-profit' : 'text-magenta'}`}
                    >
                      {step.kept ? 'KEPT' : 'REVERTED'} · {(step.improvement * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-body/70">
                    Profit per 1,000 impressions {step.normalisedBefore.toFixed(1)} →{' '}
                    {step.normalisedAfter.toFixed(1)} (category trend divided out)
                    {step.elasticity !== null
                      ? ` · sensitivity ${step.elasticity.toFixed(2)}`
                      : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {learner?.bestPrice != null && stepsSoFar.some((s) => !s.kept) ? (
            <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-[11px] text-body">
              Profit peak found at <span className="font-bold text-plum">{inr(learner.bestPrice)}</span>
              . The running estimate of price sensitivity came to{' '}
              <span className="font-bold text-plum">{learnedSoFar?.toFixed(2) ?? '—'}</span>,
              learned entirely from Ramesh&rsquo;s own ₹10 steps — no price-vs-sales history
              existed when this listing went live.
            </p>
          ) : null}
        </Card>

        {/* ---------------------------------------------------------- event log */}
        <Card tone="white">
          <CardTitle hint="Scripted events and the alerts they set off. Tap an alert to read the message.">
            What happened
          </CardTitle>
          <ul className="max-h-[22rem] space-y-1.5 overflow-y-auto">
            {log.length === 0 ? (
              <li className="text-xs text-body/60">Nothing yet — press Play.</li>
            ) : (
              log.map((row, i) => (
                <li key={`${row.week}-${row.kind}-${i}`}>
                  <button
                    type="button"
                    disabled={!row.alert}
                    onClick={() => row.alert && setOpenAlert(row.alert)}
                    className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                      row.kind === 'alert'
                        ? 'bg-magenta/10 hover:bg-magenta/15'
                        : 'bg-lilac/70'
                    }`}
                  >
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-plum">
                        Week {row.week}
                      </span>
                      <span className="text-xs font-semibold text-plum-deep">{row.title}</span>
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-body/70">
                      {row.detail}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>

      {/* --------------------------------------------------------- alert detail */}
      {/*
        The demo stops at week 16 "to show the alert on the phone", so the alert
        detail opens in the same phone mock-up Screen 4 uses rather
        than as another card. It is the same message the seller actually gets.
      */}
      {openAlert ? (
        <Card tone="lilac" className="mt-4">
          <CardTitle
            tone="lilac"
            hint={openAlert.detail}
            aside={
              <button
                type="button"
                onClick={() => setOpenAlert(null)}
                className="rounded-lg bg-white px-3 py-1.5 text-[11px] font-semibold text-plum"
              >
                {t('label.week')} {openAlert.week} · Close
              </button>
            }
          >
            {openAlert.id} · {openAlert.title}
          </CardTitle>

          <div className="mt-2">
            <PhoneFrame
              title="Sahi Daam"
              subtitle={`${lang === 'en' ? 'Business account' : 'व्यापार खाता'} · ${sellerProduct[lang](DEMO_SELLER[lang], DEMO_PRODUCT[lang])}`}
            >
              <AlertBubble
                alert={openAlert}
                lang={lang}
                time="09:14"
                onCheckPrice={() => setOpenAlert(null)}
              />
            </PhoneFrame>
          </div>
        </Card>
      ) : null}

      {/* -------------------------------------------------------- week-26 summary */}
      {finished ? (
        <Card tone="peach" className="mt-4">
          <CardTitle tone="peach" hint="Twenty-six weeks, one product, three ways of pricing it.">
            Where they ended up
          </CardTitle>

          <div className="grid gap-3 sm:grid-cols-3">
            {allRuns.map((run) => {
              const winner = run.strategy === 'sahi_daam'
              return (
                <div
                  key={run.strategy}
                  className={`rounded-card p-4 ${winner ? 'bg-plum text-white' : 'bg-white'}`}
                >
                  <p
                    className={`text-xs font-semibold uppercase tracking-wide ${winner ? 'text-white/70' : 'text-body/60'}`}
                  >
                    {STRATEGY_LABEL[run.strategy]}
                  </p>
                  <p
                    className={`mt-1 text-3xl font-bold leading-none ${
                      run.summary.totalProfit >= 0 ? 'text-orange' : 'text-magenta'
                    }`}
                  >
                    {signedInr(run.summary.totalProfit)}
                  </p>
                  <dl className="mt-3 space-y-1 text-[11px]">
                    {[
                      ['Profit per unit sold', signedInr(perUnit(run))],
                      ['Units sold', units(Math.round(run.summary.unitsSold))],
                      ['Weeks below floor', String(run.summary.weeksBelowFloor)],
                      ['Sold out in week', soldOutWeek(run) ? String(soldOutWeek(run)) : '—'],
                      ['Final price', inr(run.summary.finalPrice)],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-3">
                        <dt className={winner ? 'text-white/70' : 'text-body/60'}>{label}</dt>
                        <dd className={`font-semibold tabular-nums ${winner ? 'text-white' : 'text-plum-deep'}`}>
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )
            })}
          </div>

          <p className="mt-3 rounded-card bg-white px-3 py-2 text-xs leading-relaxed text-body">
            <span className="font-semibold text-plum">
              Sahi Daam finished{' '}
              {inr(sim.sahiDaam.summary.totalProfit - sim.sellerInstinct.summary.totalProfit)} ahead
              of seller instinct and{' '}
              {inr(sim.sahiDaam.summary.totalProfit - sim.meeshoRange.summary.totalProfit)} ahead of
              Meesho range.
            </span>{' '}
            Volume did not decide it: the three sold{' '}
            {allRuns.map((r) => units(Math.round(r.summary.unitsSold))).join(', ')} units. Each unit
            did — {allRuns.map((r) => `${signedInr(perUnit(r))} (${STRATEGY_LABEL[r.strategy]})`).join(', ')}.
            {allRuns.some((r) => soldOutWeek(r) !== undefined) ? (
              <>
                {' '}
                Stock ran out in week{' '}
                {allRuns
                  .filter((r) => soldOutWeek(r) !== undefined)
                  .map((r) => `${soldOutWeek(r)} for ${STRATEGY_LABEL[r.strategy]}`)
                  .join(', ')}
                , which is where each line goes flat.
              </>
            ) : null}
          </p>
        </Card>
      ) : null}
    </div>
  )
}
