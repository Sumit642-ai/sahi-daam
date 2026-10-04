/**
 * The 26-week seller-journey world.
 *
 * One kurti, three strategies, the same world — same seed, same noise draws,
 * same scripted events — so the only thing separating the cumulative-profit
 * lines is how each of them prices:
 *
 *   sahi_daam        the floor, the band, the learner, and the triggers
 *   seller_instinct  cost × 2, matches the week-12 undercut, never checks
 *   meesho_range     the similar-listing band median every week — what
 *                    following Meesho's range alone would do
 *
 * Profit is always measured on the SELLER floor: what Meesho's supplier policy
 * actually charges the seller.
 *
 * The demand model in here is HIDDEN (spec section 7.1): it exists to generate
 * believable weekly numbers, and `learner.ts` must never see it. The learner is
 * handed observations, never this module.
 *
 * Pure, framework-free. No React imports.
 */
import journey from '../data/journey.json'
import { type Band, bandFor, nearestListings, percentileOf, withUndercut } from './band'
import {
  type FloorInput,
  type FloorRange,
  defaultFloorInput,
  sellerFloor as computeFloor,
  floorRange,
} from './floor'
import {
  type LearnerState,
  type LearnerStep,
  type WeekObservation,
  createLearner,
  observeWeek,
} from './learner'
import { type Stage, minMarginFor, recommend } from './recommend'
import { seasonIndexForDate } from './season'
import { type Alert, type TriggerContext, evaluateTriggers } from './triggers'

// --------------------------------------------------------- hidden parameters

/** Everything in spec section 7.1. Unwrapped from the one labelled block. */
const H = {
  epsilon: journey.hiddenDemand.epsilon.value,
  noisePct: journey.hiddenDemand.noisePct.value,
  orderNoisePct: journey.hiddenDemand.orderNoisePct.value,
  rtoNoisePp: journey.hiddenDemand.rtoNoisePp.value,
  festiveTrend: journey.hiddenDemand.festiveTrend.value,
  declineTrend: journey.hiddenDemand.declineTrend.value,
  visibilityFloor: journey.hiddenDemand.visibilityFloor.value,
  visibilityKnee: journey.hiddenDemand.visibilityKneePercentile.value,
  seed: journey.hiddenDemand.seed.value,
  plateau: journey.hiddenDemand.baseImpressionsPlateau.value,
  launchShare: journey.hiddenDemand.launchImpressionShare.value,
  ratingHalfPoint: journey.hiddenDemand.ratingHalfPoint.value,
  launchStageMultiplier: journey.hiddenDemand.launchStageMultiplier.value,
  baseCvr: journey.hiddenDemand.baseCvr.value,
  ratingBoostFloor: journey.hiddenDemand.ratingBoostFloor.value,
  ratingBoostHalfPoint: journey.hiddenDemand.ratingBoostHalfPoint.value,
  ratingRate: journey.hiddenDemand.ratingRate.value,
}

const WEEKS = journey.calendar.weeks.value
const START_DATE = journey.calendar.week1StartDate.value
const PRODUCT = {
  categoryId: journey.product.categoryId,
  cogs: journey.product.cogs.value,
  weightG: journey.product.weightG.value,
  startingStock: journey.product.startingStock.value,
  restockAt: journey.product.restockAt.value,
  restockQuantity: journey.product.restockQuantity.value,
  restockLimit: journey.product.restockLimit.value,
}

/** The scripted events, straight from journey.json (spec section 7.2). */
export const JOURNEY_EVENTS = journey.events

export interface JourneyEvent {
  week: number
  weekEnd?: number
  id: string
  type: string
  title_en: string
  title_hi: string
  detail_en: string
  detail_hi: string
  source: string
}

/** mulberry32, same generator as the listings, so runs are reproducible. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Monday of week `week`, counting from the configured start date. */
export function weekDate(week: number): Date {
  const start = new Date(`${START_DATE}T00:00:00`)
  start.setDate(start.getDate() + (week - 1) * 7)
  return start
}

/**
 * YYYY-MM-DD in LOCAL time. `toISOString()` converts to UTC first, which in
 * India shifts every Monday back to the Sunday before it.
 */
export function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// ---------------------------------------------------- the hidden demand model

/** Grows from a standing start as ratings accumulate (spec section 7.1). */
function baseImpressions(stage: Stage, ratingCount: number): number {
  const growth =
    H.launchShare + (1 - H.launchShare) * (ratingCount / (ratingCount + H.ratingHalfPoint))
  const stageMultiplier = stage === 'LAUNCH' ? H.launchStageMultiplier : 1
  return H.plateau * growth * stageMultiplier
}

/** 1.0 up to the 40th percentile, falling linearly to 0.30 at the 100th. */
function visibility(percentile: number): number {
  if (percentile <= H.visibilityKnee) return 1
  const span = 100 - H.visibilityKnee
  const over = Math.min(100, percentile) - H.visibilityKnee
  return 1 - (1 - H.visibilityFloor) * (over / span)
}

/** 1.0 normally, 1.5 through the festive weeks, decaying to 0.6 by week 26. */
export function categoryTrend(week: number): number {
  if (week >= 16 && week <= 21) return H.festiveTrend
  if (week <= 21) return 1
  const weeksIntoDecline = week - 21
  const total = WEEKS - 21
  return 1 - (1 - H.declineTrend) * (weeksIntoDecline / total)
}

/** The price-sensitivity curve. ε is hidden; this is the only place it is used. */
function conversionRate(
  price: number,
  bandP50: number,
  ratingCount: number,
  epsilon: number,
): number {
  const ratingBoost =
    H.ratingBoostFloor +
    (1 - H.ratingBoostFloor) * (ratingCount / (ratingCount + H.ratingBoostHalfPoint))
  return H.baseCvr * Math.pow(price / bandP50, -epsilon) * ratingBoost
}

/**
 * The two hidden parameters a robustness check varies. Defaults are the
 * journey's own (ε = 2.2, the fixed seed), so `runSimulation()` with no
 * arguments is exactly the journey every screen shows.
 */
export interface WorldOptions {
  epsilon?: number
  seed?: number
}

// ------------------------------------------------------------------- outputs

export type StrategyId = 'sahi_daam' | 'seller_instinct' | 'meesho_range'

export const STRATEGY_IDS: readonly StrategyId[] = ['sahi_daam', 'seller_instinct', 'meesho_range']

export const STRATEGY_LABEL: Record<StrategyId, string> = {
  sahi_daam: 'Sahi Daam',
  seller_instinct: 'Seller instinct',
  meesho_range: 'Meesho range',
}

export interface WeekRow {
  week: number
  /** ISO date of the Monday. */
  date: string
  stage: Stage
  price: number
  floor: number
  bandP10: number
  bandP50: number
  bandP90: number
  percentile: number
  impressions: number
  orders: number
  rtoPct: number
  returnPct: number
  cleanSales: number
  profit: number
  cumulativeProfit: number
  stockLeft: number
  alerts: Alert[]
  /** The product cost that week — it rises at week 14. */
  cogs: number
  /** The RTO season multiplier that week. */
  seasonIndex: number
}

export interface StrategySummary {
  totalProfit: number
  weeksBelowFloor: number
  unitsSold: number
  stockLeft: number
  finalPrice: number
  /** Units reordered mid-journey, on top of the 1,500 starting stock. */
  unitsRestocked: number
  bestWeek: number
  worstWeek: number
}

export interface StrategyRun {
  strategy: StrategyId
  weeks: WeekRow[]
  summary: StrategySummary
  /** Populated for Sahi Daam only; the seller-instinct run never learns. */
  learnerSteps: LearnerStep[]
  learner: LearnerState | null
}

export interface Simulation {
  sahiDaam: StrategyRun
  sellerInstinct: StrategyRun
  /** Lists at the similar-listing band median every week. */
  meeshoRange: StrategyRun
  events: JourneyEvent[]
  /** Revealed in judge mode only (spec section 9). */
  hidden: { epsilon: number; seed: number }
}

// --------------------------------------------------------------- the strategy

interface WorldWeek {
  week: number
  date: Date
  stage: Stage
  seasonIndex: number
  cogs: number
  returnRateBase: number
  band: Band
  input: FloorInput
  range: FloorRange
}

/**
 * Everything about the world in week `week`, before anyone has priced.
 *
 * `undercutBand` is precomputed once against a FIXED cohort. Recomputing it
 * each week against the current price makes the market move whenever the seller
 * does — a different five listings get cut, p90 shifts, and the price
 * oscillates by ₹30 a week chasing its own tail.
 */
function worldFor(week: number, baseBand: Band, undercutBand: Band): WorldWeek {
  const date = weekDate(week)
  const seasonIndex = seasonIndexForDate(date)
  const cogs = week >= 14 ? Math.round(PRODUCT.cogs * 1.06) : PRODUCT.cogs

  const defaults = defaultFloorInput(PRODUCT.categoryId)
  // Weeks 16-18: a batch runs small and returns climb 6 points.
  const sizeComplaints = week >= 16 && week <= 18 ? 0.06 : 0
  const returnRateBase = defaults.returnRate + sizeComplaints

  // Week 12 onwards: the five listings nearest the seller cut their prices 10%.
  const band = week >= 12 ? undercutBand : baseBand

  const input: FloorInput = {
    ...defaults,
    cogs,
    weightG: PRODUCT.weightG,
    returnRate: returnRateBase,
    seasonIndex,
  }
  const range = floorRange(input, {
    low: returnRateBase - 0.007,
    expected: returnRateBase,
    high: returnRateBase + 0.093,
  })

  return { week, date, stage: 'LAUNCH', seasonIndex, cogs, returnRateBase, band, input, range }
}

function stageFor(week: number, learnerPeaked: boolean): Stage {
  if (week < 4) return 'LAUNCH'
  if (week >= 22) return 'DECLINE'
  return learnerPeaked ? 'MATURE' : 'RAMP'
}

/**
 * Run one strategy through the whole world.
 *
 * Both strategies are run with the same seed and draw the same random values in
 * the same order, so the noise they experience is identical week by week.
 */
function runStrategy(strategy: StrategyId, world_: Required<WorldOptions>): StrategyRun {
  const rnd = mulberry32(world_.seed)
  const baseBand = bandFor(PRODUCT.categoryId)

  // Week-1 setup, shared by both strategies.
  const week1 = worldFor(1, baseBand, baseBand)
  const launchRecommendation = recommend('LAUNCH', week1.range, week1.band)
  const startingPrice =
    strategy === 'sahi_daam'
      ? launchRecommendation.price
      : strategy === 'meesho_range'
        ? Math.round(baseBand.p50) // the middle of the similar-listing band
        : PRODUCT.cogs * 2 // the interviewed seller's rule: cost x 2
  const cohort = nearestListings(baseBand, startingPrice).map((l) => l.id)

  let price = startingPrice

  // The week-12 event belongs to the WORLD, not to the strategy: it is one
  // marketplace, and the same five listings cut their prices whoever is
  // watching. Anchoring it on the launch recommendation (rather than on each
  // strategy's own price) is what keeps spec section 7.3's "identical world"
  // actually identical — otherwise the two runs see different bands.
  const undercutBand = withUndercut(baseBand, launchRecommendation.price, 0.1)

  /** The cohort's median before the week-12 cut — T3's reference point. */
  const cohortReferenceMedian = (() => {
    const prices = baseBand.listings
      .filter((l) => cohort.includes(l.id))
      .map((l) => l.price)
      .sort((a, b) => a - b)
    return prices[Math.floor(prices.length / 2)] ?? baseBand.p50
  })()

  let learner = createLearner(price)
  let ratingCount = 0
  let stockLeft = PRODUCT.startingStock
  let cumulativeProfit = 0
  let maturePrice = price
  let previousImpressions: number | null = null
  let previousOrders: number | null = null
  let declineCuts = 0
  let unitsRestocked = 0
  let restockCount = 0
  let firedLastWeek = new Set<string>()
  /**
   * What the learner settled on, as rupees above the floor it settled against.
   * When the floor later moves — festive RTO, the fabric rise, size complaints
   * — Sahi Daam carries that margin with it instead of hugging the new floor.
   * Hugging the floor is the obviously "safe" move and it is badly wrong: at a
   * festive floor of ₹420 it earns about ₹9 a sale against ₹67 for carrying the
   * margin, because the lost volume is far smaller than the lost margin.
   */
  let learnedMargin: number | null = null

  const weeks: WeekRow[] = []

  for (let week = 1; week <= WEEKS; week += 1) {
    const stage = stageFor(week, learner.status === 'PEAKED')
    const world = worldFor(week, baseBand, undercutBand)
    world.stage = stage

    // ---- what the strategy lists at this week ------------------------------
    if (strategy === 'sahi_daam') {
      if (week < 4) {
        price = launchRecommendation.price
      } else if (week >= 22) {
        const weeksInStage = week - 22
        price = recommend('DECLINE', world.range, world.band, {
          currentPrice: maturePrice,
          weeksInStage,
          stockCoverWeeks: previousOrders && previousOrders > 0 ? stockLeft / previousOrders : 99,
        }).price
      } else {
        price = learner.status === 'PEAKED' ? (learner.bestPrice ?? price) : learner.currentPrice
        // Responding to the triggers: when the floor moves under you, the price
        // moves with it, carrying the margin the learner found.
        const carried =
          learnedMargin === null ? null : Math.ceil(world.range.expected + learnedMargin)
        if (carried !== null && carried > price) price = carried
        // Never above the 90th percentile of the market: past that a listing
        // stops being found, whatever the arithmetic says. The floor overrides
        // the cap — if the floor itself is above p90 the product is NOT_VIABLE
        // and no price saves it, so the guardrail takes over instead.
        const safe = Math.ceil(world.range.expected + minMarginFor(world.range.expected))
        price = Math.min(price, Math.max(Math.round(world.band.p90), safe))
        if (price < safe) price = safe
        maturePrice = price
      }
    } else if (strategy === 'meesho_range') {
      // Follows the similar-listing band, week-12 undercut included. Never
      // checks the floor; never reprices for festive RTO.
      price = Math.round(world.band.p50)
    } else {
      // Seller instinct, from the team's interviews.
      if (week === 12) {
        // Match the undercut immediately, without checking the floor.
        const rivals = world.band.listings.filter((l) => cohort.includes(l.id))
        const median = rivals.length
          ? [...rivals].sort((a, b) => a.price - b.price)[Math.floor(rivals.length / 2)]!.price
          : price
        price = Math.round(median)
      }
      if (week >= 22 && previousOrders !== null && previousOrders > 0) {
        const lastRow = weeks[weeks.length - 1]
        if (lastRow && lastRow.orders < previousOrders && declineCuts < 5) {
          price = Math.max(1, Math.round(price * 0.8)) // panic cut
          declineCuts += 1
        }
      }
      // Never recomputes the floor, never adjusts for festive RTO.
    }

    // ---- the hidden world responds ----------------------------------------
    const percentile = percentileOf(world.band, price)
    const trend = categoryTrend(week)
    const impressionNoise = 1 + (rnd() * 2 - 1) * H.noisePct
    const orderNoise = 1 + (rnd() * 2 - 1) * H.orderNoisePct

    const impressions = Math.max(
      0,
      baseImpressions(stage, ratingCount) * visibility(percentile) * trend * impressionNoise,
    )
    const cvr = conversionRate(price, world.band.p50, ratingCount, world_.epsilon)
    let orders = Math.max(0, impressions * cvr * orderNoise)

    // Realised RTO and returns: the model, plus +/- 1 percentage point.
    const modelledRto = Math.min(
      0.9,
      (world.input.codShare * world.input.rtoCod +
        (1 - world.input.codShare) * world.input.rtoPrepaid) *
        world.seasonIndex,
    )
    const rtoPct = Math.max(
      0,
      modelledRto + ((rnd() * 2 - 1) * H.rtoNoisePp) / 100,
    )
    const returnPct = Math.max(
      0,
      world.returnRateBase + ((rnd() * 2 - 1) * H.rtoNoisePp) / 100,
    )

    // The floor at this week's realised rates, from the real engine.
    const realised = computeFloor({
      ...world.input,
      returnRate: returnPct,
      unitOverrides: { rtoUnits: 100 * rtoPct },
    })

    // Stock caps how much can actually be dispatched.
    const consumptionPerOrder = (realised.cleanSales + realised.writeOffUnits) / 100
    if (consumptionPerOrder > 0) {
      orders = Math.min(orders, stockLeft / consumptionPerOrder)
    }

    const cleanSales = orders * (realised.cleanSales / 100)
    const profit = cleanSales * (price - realised.floor)
    cumulativeProfit += profit
    stockLeft = Math.max(0, stockLeft - orders * consumptionPerOrder)
    // Sellers reorder. Without this a seller who underprices simply sells out
    // and stops trading, and the festive season — the most expensive lesson in
    // the journey — never reaches them at all.
    if (
      stockLeft < PRODUCT.restockAt &&
      week < WEEKS &&
      restockCount < PRODUCT.restockLimit
    ) {
      stockLeft += PRODUCT.restockQuantity
      unitsRestocked += PRODUCT.restockQuantity
      restockCount += 1
    }
    ratingCount += cleanSales * H.ratingRate

    // ---- triggers ---------------------------------------------------------
    const recentReturnRates = weeks.slice(-1).map((w) => w.returnPct).concat(returnPct)
    const triggerContext: TriggerContext = {
      week,
      date: world.date,
      input: { ...world.input, returnRate: returnPct },
      range: world.range,
      band: world.band,
      price,
      baselineReturnRate: defaultFloorInput(PRODUCT.categoryId).returnRate,
      recentReturnRates,
      competitorCohort: cohort,
      competitorReferenceMedian: cohortReferenceMedian,
      impressions,
      previousImpressions: previousImpressions ?? undefined,
      categoryTrend: trend,
      previousCategoryTrend: week > 1 ? categoryTrend(week - 1) : trend,
      previousCogs: week === 14 ? PRODUCT.cogs : undefined,
    }
    // Rising edge only. A condition that holds for ten weeks is one alert, not
    // ten — nobody reads the same WhatsApp every Monday, and a repeated alert
    // trains the seller to ignore all of them.
    const firing = evaluateTriggers(triggerContext)
    const alerts = firing.filter((a) => !firedLastWeek.has(a.id))
    firedLastWeek = new Set(firing.map((a) => a.id))

    weeks.push({
      week,
      date: isoDate(world.date),
      stage,
      price,
      floor: realised.floor,
      bandP10: world.band.p10,
      bandP50: world.band.p50,
      bandP90: world.band.p90,
      percentile,
      impressions,
      orders,
      rtoPct,
      returnPct,
      cleanSales,
      profit,
      cumulativeProfit,
      stockLeft,
      alerts,
      cogs: world.cogs,
      seasonIndex: world.seasonIndex,
    })

    // ---- the learner sees only what the seller sees ------------------------
    if (strategy === 'sahi_daam' && stage === 'RAMP') {
      const observation: WeekObservation = {
        week,
        price,
        impressions,
        orders,
        survivalRate: realised.survivalRate,
        floor: realised.floor,
        categoryTrend: trend,
      }
      learner = observeWeek(learner, observation, world.band.p50)
      if (learner.status === 'PEAKED') {
        maturePrice = learner.bestPrice ?? price
        learnedMargin = maturePrice - world.range.expected
      }
    }

    previousImpressions = impressions
    previousOrders = orders
  }

  const unitsSold = weeks.reduce((sum, w) => sum + w.cleanSales, 0)
  const weeksBelowFloor = weeks.filter((w) => w.price < w.floor).length
  const profits = weeks.map((w) => w.profit)

  return {
    strategy,
    weeks,
    summary: {
      totalProfit: cumulativeProfit,
      weeksBelowFloor,
      unitsSold,
      stockLeft,
      finalPrice: weeks[weeks.length - 1]!.price,
      unitsRestocked,
      bestWeek: weeks[profits.indexOf(Math.max(...profits))]!.week,
      worstWeek: weeks[profits.indexOf(Math.min(...profits))]!.week,
    },
    learnerSteps: strategy === 'sahi_daam' ? learner.steps : [],
    learner: strategy === 'sahi_daam' ? learner : null,
  }
}

/** The whole 26-week journey, both strategies, deterministic. */
export function runSimulation(options: WorldOptions = {}): Simulation {
  const world = { epsilon: options.epsilon ?? H.epsilon, seed: options.seed ?? H.seed }
  return {
    sahiDaam: runStrategy('sahi_daam', world),
    sellerInstinct: runStrategy('seller_instinct', world),
    meeshoRange: runStrategy('meesho_range', world),
    events: JOURNEY_EVENTS as JourneyEvent[],
    hidden: world,
  }
}
