import { useState } from 'react'

import { nearestListings, withUndercut } from '../engine/band'
import { floorRange } from '../engine/floor'
import { inr } from '../engine/format'
import { DEMO_PRODUCT, DEMO_SELLER, sellerProduct } from '../engine/nudges'
import { seasonIndex } from '../engine/season'
import {
  TRIGGER_IDS,
  TRIGGER_TITLE,
  THRESHOLDS,
  type Alert,
  type TriggerContext,
  type TriggerId,
  checkTrigger,
} from '../engine/triggers'
import { AlertBubble, PhoneFrame } from '../components/AlertPhone'
import { Card, CardTitle } from '../components/Card'
import { useAuth } from '../auth'
import { useI18n } from '../i18n'
import { useProduct } from '../state/productInputs'

/**
 * Screen 4 — Daam Badlo.
 *
 * A phone mock-up of the WhatsApp messages the seller actually receives, and a
 * panel of six buttons that fire each trigger on demand against the current
 * product — so a judge can see any of T1–T6 without sitting through 26 weeks of
 * the journey.
 */

interface AlertsProps {
  /** Deep-link to Screen 2 (spec section 9.5). */
  onOpenBand: () => void
}

/** What each Fire button is pretending has just happened. */
const DEMO_SCENARIO: Record<TriggerId, string> = {
  T1: 'A batch runs small and returns jump 6 points from week 16 — the alert fires in week 17 of the journey.',
  T2: 'Two weeks out from the November festive peak, where RTO runs 1.867× the March baseline.',
  T3: 'The five listings nearest yours cut their prices 10% — the journey’s week-12 event.',
  T4: 'Your impressions fall a quarter while category demand holds steady. Not part of the 26-week journey.',
  T5: 'Your supplier raises fabric 6% — the journey’s week-14 event.',
  T6: 'You panic-cut the price 15% without checking the floor. Fires whenever you change the price by hand.',
}

/**
 * The week each trigger actually fires in the 26-week journey, so a demo
 * alert never claims a week it did not happen in. T2 fires twice (weeks 12
 * and 16); the demo is the November warning, week 16. T4 and T6 never fire in
 * the journey — they are shown without a week (0) rather than an invented one.
 * tests/alerts.test.ts checks every entry against runSimulation().
 */
export const JOURNEY_WEEK: Record<TriggerId, number> = {
  T1: 17,
  T2: 16,
  T3: 12,
  T4: 0,
  T5: 14,
  T6: 0,
}

type Delivered = Alert & { key: string; time: string }

/** Fired on first load. */
const PREFIRED: TriggerId = 'T2'

export function Alerts({ onOpenBand }: AlertsProps) {
  const { inputs, update, category, floorInput, range, band, season } = useProduct()
  const { t, lang } = useI18n()
  const { account } = useAuth()
  // The seller's own name, so the alerts read as the seller's own.
  const sellerName = account?.profile?.sellerName?.trim() || DEMO_SELLER[lang]
  const productName = DEMO_PRODUCT[lang]
  const price = inputs.plannedPrice ?? Math.round(range.expected + 6)

  // The festive alert is already on the phone when the screen opens: it is
  // the one every seller gets in October, so the chat is never empty.
  // Not when no price can work (every order comes back): the message would
  // have nothing true to say, and the Fire button is still there.
  const [feed, setFeed] = useState<Delivered[]>(() => {
    if (!Number.isFinite(range.expected) || !Number.isFinite(price)) return []
    const festive = checkTrigger(PREFIRED, demoContext(PREFIRED))
    return festive ? [{ ...festive, key: `${PREFIRED}-on-open`, time: '09:14' }] : []
  })
  const [lastFired, setLastFired] = useState<TriggerId | null>(PREFIRED)

  /**
   * A context that makes one trigger fire, built from the real product plus the
   * smallest plausible scenario for that trigger. Everything here is honest
   * input to the real rule — none of the six is faked into firing.
   */
  function demoContext(id: TriggerId): TriggerContext {
    const base: TriggerContext = {
      week: JOURNEY_WEEK[id],
      date: new Date(2026, 9, 19), // Monday of journey week 16, two weeks before the peak
      input: floorInput,
      range,
      band,
      price,
    }

    switch (id) {
      case 'T1': {
        const worse = inputs.returnRateExpected + THRESHOLDS.T1_RETURN_RATE_PP + 0.01
        return {
          ...base,
          baselineReturnRate: inputs.returnRateExpected,
          recentReturnRates: [worse, worse],
        }
      }
      case 'T2':
        return { ...base, seasonIndexAhead: seasonIndex('Nov') }
      case 'T3': {
        // The market moves, not the seller. Remember who you were competing
        // with BEFORE the cut — that cohort is what an undercut is about.
        const rivals = nearestListings(band, price)
        const before = rivals.map((l) => l.price).sort((a, b) => a - b)
        return {
          ...base,
          band: withUndercut(band, price, 0.1),
          competitorCohort: rivals.map((l) => l.id),
          competitorReferenceMedian: before[Math.floor(before.length / 2)],
        }
      }
      case 'T4':
        return {
          ...base,
          impressions: 750,
          previousImpressions: 1_000,
          categoryTrend: 1,
          previousCategoryTrend: 1,
        }
      case 'T5': {
        const risen = { ...floorInput, cogs: Math.round(floorInput.cogs * 1.06) }
        return {
          ...base,
          input: risen,
          range: floorRange(risen, {
            low: inputs.returnRateLow,
            expected: inputs.returnRateExpected,
            high: inputs.returnRateHigh,
          }),
          previousCogs: floorInput.cogs,
        }
      }
      case 'T6':
        return { ...base, manualPriceChange: { from: price, to: Math.round(price * 0.85) } }
    }
  }

  function fire(id: TriggerId) {
    const alert = checkTrigger(id, demoContext(id))
    setLastFired(id)
    if (!alert) return
    setFeed((f) => {
      // The clock has to be derived inside the updater: "Fire all six" calls
      // this six times in one tick, and `feed` outside is stale for all of them.
      const minutes = 9 * 60 + 14 + f.length * 23
      const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
      return [...f, { ...alert, key: `${id}-${Date.now()}-${f.length}`, time }]
    })
  }

  /** Spec section 9.5: the button loads that week's numbers into Screen 2. */
  function openBandWith(alert: Alert) {
    const restore = alert.restore
    if (restore) {
      update({
        ...(restore.price !== undefined ? { plannedPrice: restore.price } : {}),
        ...(restore.cogs !== undefined ? { cogs: restore.cogs } : {}),
        ...(restore.month !== undefined ? { month: restore.month } : {}),
        ...(restore.returnRateExpected !== undefined
          ? { returnRateExpected: restore.returnRateExpected }
          : {}),
      })
    }
    onOpenBand()
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-plum sm:text-3xl">
          {t('nav.alerts')}{' '}
          <span className="text-base font-medium text-body/60">· {t('nav.alertsSub')}</span>
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-body">
          Pricing once is not enough — returns climb, the festive season lifts RTO, a neighbour
          undercuts, fabric gets dearer. Six triggers watch for exactly that and tell{' '}
          {sellerName} what it costs, in rupees, on the phone he already uses.
        </p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
        {/* ------------------------------------------------------- the phone */}
        <div>
          <PhoneFrame
            title="Sahi Daam"
            subtitle={`${lang === 'en' ? 'Business account' : 'व्यापार खाता'} · ${sellerProduct[lang](sellerName, productName)}`}
            footer={
              <p className="text-center text-[10px] leading-snug text-body/60">
                Mock-up of the WhatsApp message a seller would receive. Not a real WhatsApp
                integration.
              </p>
            }
          >
            {feed.length === 0 ? (
              <p className="rounded-2xl rounded-tl-sm bg-white px-3 py-2.5 text-[12px] leading-snug text-body/60">
                No alerts yet. Fire a trigger from the panel to see the message{' '}
                {sellerName} would get.
              </p>
            ) : (
              feed.map((alert) => (
                <AlertBubble
                  key={alert.key}
                  alert={alert}
                  lang={lang}
                  sellerName={sellerName}
                  time={alert.time}
                  onCheckPrice={openBandWith}
                />
              ))
            )}
          </PhoneFrame>
        </div>

        {/* ------------------------------------------------- the trigger panel */}
        <div className="space-y-4">
          <Card tone="lilac">
            <CardTitle
              tone="lilac"
              hint="Each button runs the real trigger rule against your current product — nothing is faked into firing."
            >
              Fire a trigger
            </CardTitle>

            <div className="grid gap-2 sm:grid-cols-2">
              {TRIGGER_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => fire(id)}
                  className={`rounded-card p-3 text-left transition-colors ${
                    lastFired === id ? 'bg-plum text-white' : 'bg-white hover:bg-white/70'
                  }`}
                >
                  <span className="flex items-baseline gap-2">
                    <span
                      className={`text-sm font-bold ${lastFired === id ? 'text-orange' : 'text-plum'}`}
                    >
                      Fire {id}
                    </span>
                    <span
                      className={`text-[11px] font-medium ${
                        lastFired === id ? 'text-white/80' : 'text-plum-deep'
                      }`}
                    >
                      {TRIGGER_TITLE[id]}
                    </span>
                  </span>
                  <span
                    className={`mt-1 block text-[11px] leading-snug ${
                      lastFired === id ? 'text-white/70' : 'text-body/60'
                    }`}
                  >
                    {DEMO_SCENARIO[id]}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => TRIGGER_IDS.forEach(fire)}
                className="rounded-lg bg-plum px-3 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-plum-deep"
              >
                Fire all six
              </button>
              <button
                type="button"
                onClick={() => {
                  setFeed([])
                  setLastFired(null)
                }}
                className="rounded-lg bg-white px-3 py-2 text-[11px] font-semibold text-plum transition-colors hover:bg-white/70"
              >
                Clear the chat
              </button>
            </div>
          </Card>

          <Card tone="peach">
            <CardTitle tone="peach" hint="Carried from Aapki Laagat — the alerts quote these numbers.">
              What the alerts are about
            </CardTitle>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: t('label.product'), value: lang === 'hi' ? category.name_hi : category.name_en },
                { label: t('label.yourPrice'), value: inr(price) },
                { label: t('label.floor'), value: inr(range.expected) },
                { label: t('label.season'), value: season === 1 ? t('label.baseline') : `×${season}` },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg bg-white/70 px-3 py-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-body/60">
                    {stat.label}
                  </dt>
                  <dd className="mt-0.5 text-sm font-bold text-plum-deep">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card tone="white">
            <CardTitle hint="What each rule actually watches.">
              The six rules
            </CardTitle>
            <ul className="space-y-1.5">
              {[
                ['T1', 'Last-2-week return rate reaches baseline + 5 percentage points.'],
                ['T2', 'The RTO season index for the next two weeks reaches 1.4.'],
                ['T3', 'The median of the five closest listings falls more than 8% below you.'],
                ['T4', 'Your impressions drop 20% while category demand is flat or rising.'],
                ['T5', 'Your product cost moves by more than 5%.'],
                ['T6', 'You change the price by hand, at all.'],
              ].map(([id, rule]) => (
                <li key={id} className="flex gap-2 rounded-lg bg-lilac/60 px-3 py-2">
                  <span className="shrink-0 text-[11px] font-bold text-plum">{id}</span>
                  <span className="text-[11px] leading-snug text-body">{rule}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-snug text-body/60">
              Every alert carries the arithmetic behind it — open the ⓘ on any bubble to see the
              rule it matched and every number it quotes. &ldquo;{' '}
              {lang === 'en' ? 'Daam check karein' : 'दाम जाँचें'}&rdquo; loads that alert&rsquo;s
              numbers into Bazaar Ka Daam.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
