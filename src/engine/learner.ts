/**
 * The price-step learner (spec section 6.5).
 *
 * This is how Sahi Daam learns a product's price sensitivity without any
 * price-vs-sales history, which a new listing simply does not have. During the
 * ramp stage it takes one ₹10–20 step per week, measures profit per 1,000
 * impressions, keeps the step if that improved by more than 2% once the
 * category's own demand trend is divided out, and reverts the moment it falls.
 * The price it reverts to is the profit peak.
 *
 * ISOLATION (spec section 6.5, test 9). This module must never import from the
 * simulator, and must never read its hidden demand parameters — the true price
 * sensitivity, the underlying conversion curve, or how often a listing is
 * shown. It sees only what a real seller's dashboard shows: price, impressions,
 * orders, RTO, returns, the floor, and the category trend Meesho publishes.
 *
 * Everything it needs arrives as an argument. This file has no imports at all,
 * which is the simplest possible proof of that and is what test 9 asserts.
 *
 * Pure, framework-free. No React imports.
 */

/** One week of observed data — all of it visible to the seller. */
export interface WeekObservation {
  week: number
  /** What the listing was priced at that week. */
  price: number
  impressions: number
  orders: number
  /** Clean sales ÷ orders dispatched, from the floor model's realised rates. */
  survivalRate: number
  /** The floor that week, at the realised RTO and return rates. */
  floor: number
  /**
   * Category demand that week, relative to normal. Published by Meesho at
   * category level — not a hidden parameter of this product's demand curve.
   * Dividing by it is what stops a festive lift being mistaken for a win.
   */
  categoryTrend: number
}

export type LearnerStatus =
  /** Has a first week of data, no step tried yet. */
  | 'LAUNCHED'
  /** A step is out in the world, waiting on next week's numbers. */
  | 'STEPPING'
  /** A step made things worse; the previous price is the peak. */
  | 'PEAKED'

export interface LearnerStep {
  week: number
  fromPrice: number
  toPrice: number
  stepSize: number
  /** Profit per 1,000 impressions before the step. */
  metricBefore: number
  metricAfter: number
  /** The same two, with the category trend divided out. */
  normalisedBefore: number
  normalisedAfter: number
  /** (after − before) / before, on the normalised figures. */
  improvement: number
  kept: boolean
  /** ε̂ for this step, when both weeks had a measurable conversion rate. */
  elasticity: number | null
  reason: string
}

export interface PendingStep {
  week: number
  fromPrice: number
  toPrice: number
  stepSize: number
  metricBefore: number
  normalisedBefore: number
}

export interface LearnerState {
  status: LearnerStatus
  /** What the listing should be priced at now. */
  currentPrice: number
  /** The profit peak, once found. */
  bestPrice: number | null
  pending: PendingStep | null
  last: WeekObservation | null
  steps: LearnerStep[]
  /** One ε̂ per step where it could be computed. */
  elasticityEstimates: number[]
  /** The running average the seller is shown. */
  elasticityAverage: number | null
}

/** Spec section 6.5: keep the step only on a better-than-2% improvement. */
export const IMPROVEMENT_THRESHOLD = 0.02
export const BIG_STEP = 20
export const SMALL_STEP = 10

/** +₹20 below the band median, +₹10 at or above it. */
export function stepSizeFor(price: number, bandP50: number): number {
  return price < bandP50 ? BIG_STEP : SMALL_STEP
}

/**
 * Profit per 1,000 impressions — the thing being maximised.
 *
 * Orders alone would push the price down forever; profit alone ignores that a
 * dear listing is shown to fewer people. This combines both: how often a view
 * becomes an order, how often an order survives to a clean sale, and what that
 * sale actually clears.
 */
export function profitPer1000Impressions(obs: WeekObservation): number {
  if (obs.impressions <= 0) return 0
  const conversion = obs.orders / obs.impressions
  return conversion * obs.survivalRate * (obs.price - obs.floor) * 1000
}

/** The observed conversion rate — orders per impression. */
export function conversionRate(obs: WeekObservation): number {
  return obs.impressions > 0 ? obs.orders / obs.impressions : 0
}

/**
 * ε̂ = −ln(cvr_t / cvr_{t−1}) / ln(p_t / p_{t−1}).
 *
 * Returns null when it cannot be computed — equal prices, or a week with no
 * conversions at all — rather than an Infinity that would poison the average.
 */
export function estimateElasticity(
  previous: WeekObservation,
  current: WeekObservation,
): number | null {
  const cvrPrev = conversionRate(previous)
  const cvrNow = conversionRate(current)
  if (cvrPrev <= 0 || cvrNow <= 0) return null
  if (previous.price <= 0 || current.price <= 0) return null
  const priceRatio = current.price / previous.price
  if (priceRatio === 1) return null
  const value = -Math.log(cvrNow / cvrPrev) / Math.log(priceRatio)
  return Number.isFinite(value) ? value : null
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function createLearner(startPrice: number): LearnerState {
  return {
    status: 'LAUNCHED',
    currentPrice: startPrice,
    bestPrice: null,
    pending: null,
    last: null,
    steps: [],
    elasticityEstimates: [],
    elasticityAverage: null,
  }
}

/**
 * Feed in the week that has just finished, at `state.currentPrice`, and get
 * back the state — including the price to list at next week.
 *
 * Once the learner has peaked it stops proposing steps; the recommendation
 * engine holds `bestPrice` through the mature stage.
 */
export function observeWeek(
  state: LearnerState,
  observation: WeekObservation,
  bandP50: number,
): LearnerState {
  const metric = profitPer1000Impressions(observation)
  const normalised = observation.categoryTrend > 0 ? metric / observation.categoryTrend : metric

  if (state.status === 'PEAKED') {
    return { ...state, last: observation }
  }

  const elasticity = state.last ? estimateElasticity(state.last, observation) : null
  const elasticityEstimates =
    elasticity === null ? state.elasticityEstimates : [...state.elasticityEstimates, elasticity]

  // ---- a step was out in the world; judge it -------------------------------
  if (state.status === 'STEPPING' && state.pending) {
    const pending = state.pending
    const before = pending.normalisedBefore
    const improvement = before === 0 ? (normalised > 0 ? 1 : 0) : (normalised - before) / before
    const kept = improvement > IMPROVEMENT_THRESHOLD

    const step: LearnerStep = {
      week: observation.week,
      fromPrice: pending.fromPrice,
      toPrice: pending.toPrice,
      stepSize: pending.stepSize,
      metricBefore: pending.metricBefore,
      metricAfter: metric,
      normalisedBefore: before,
      normalisedAfter: normalised,
      improvement,
      kept,
      elasticity,
      reason: kept
        ? `Profit per 1,000 impressions rose ${(improvement * 100).toFixed(1)}% once the category trend was divided out — more than the 2% needed, so the step stays and we try another.`
        : `Profit per 1,000 impressions moved ${(improvement * 100).toFixed(1)}%, short of the 2% needed. Revert to ₹${pending.fromPrice} — that is the profit peak.`,
    }

    if (!kept) {
      return {
        status: 'PEAKED',
        currentPrice: pending.fromPrice,
        bestPrice: pending.fromPrice,
        pending: null,
        last: observation,
        steps: [...state.steps, step],
        elasticityEstimates,
        elasticityAverage: mean(elasticityEstimates),
      }
    }

    const stepSize = stepSizeFor(observation.price, bandP50)
    return {
      status: 'STEPPING',
      currentPrice: observation.price + stepSize,
      bestPrice: observation.price,
      pending: {
        week: observation.week,
        fromPrice: observation.price,
        toPrice: observation.price + stepSize,
        stepSize,
        metricBefore: metric,
        normalisedBefore: normalised,
      },
      last: observation,
      steps: [...state.steps, step],
      elasticityEstimates,
      elasticityAverage: mean(elasticityEstimates),
    }
  }

  // ---- first week of data; take the first step ----------------------------
  const stepSize = stepSizeFor(observation.price, bandP50)
  return {
    status: 'STEPPING',
    currentPrice: observation.price + stepSize,
    bestPrice: observation.price,
    pending: {
      week: observation.week,
      fromPrice: observation.price,
      toPrice: observation.price + stepSize,
      stepSize,
      metricBefore: metric,
      normalisedBefore: normalised,
    },
    last: observation,
    steps: state.steps,
    elasticityEstimates,
    elasticityAverage: mean(elasticityEstimates),
  }
}
