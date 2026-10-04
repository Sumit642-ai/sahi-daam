/**
 * Runs the 26-week journey and the test suite, writes sim_results.json at the
 * repo root, and prints it.
 *
 *   npm run export:sim
 *
 * Everything in the file comes from the same engine the screens use — the
 * journey is `runSimulation()` with its defaults, exactly what Ramesh ki
 * Kahani draws. The robustness block re-runs that world with the hidden price
 * sensitivity and the seed varied, to show the result is not one lucky draw.
 */
import { execSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

import { type StrategyRun, runSimulation } from '../src/engine/simulator'

const root = resolve(__dirname, '..')
const round = (n: number, dp = 0) => Math.round(n * 10 ** dp) / 10 ** dp

// ------------------------------------------------------------- the journey

/**
 * An alert counts as acted on when the strategy's price the following week —
 * or that week, for week 26 — is at or above that week's floor. Every trigger
 * ends in the same instruction (re-check the floor, do not list under it), so
 * this is the one test that applies to all six.
 */
const ACTED_ON_DEFINITION =
  'An alert is acted on when the next week’s price (the same week, for week 26) is at or above that week’s floor — every trigger’s action comes down to “do not list below your floor”.'

function summarise(run: StrategyRun) {
  const s = run.summary
  const weeks = run.weeks
  const fired = weeks.flatMap((w) => w.alerts.map((a) => ({ week: w.week, id: a.id, title: a.title })))
  const actedOn = fired.filter((a) => {
    const next = weeks[Math.min(a.week, weeks.length - 1)]!
    return next.price >= next.floor
  }).length
  const salesWeightedPrice =
    weeks.reduce((sum, w) => sum + w.price * w.cleanSales, 0) /
    Math.max(1e-9, weeks.reduce((sum, w) => sum + w.cleanSales, 0))

  return {
    week26CumulativeProfit: round(s.totalProfit),
    profitPerUnitSold: round(s.totalProfit / s.unitsSold, 2),
    weeksBelowFloor: s.weeksBelowFloor,
    unitsSold: round(s.unitsSold),
    averagePrice: round(salesWeightedPrice, 2),
    finalPrice: s.finalPrice,
    stockLeft: round(s.stockLeft),
    unitsRestocked: s.unitsRestocked,
    alertsRaised: fired.length,
    alertsActedOn: actedOn,
    firedTriggers: fired,
    weeklyPrices: weeks.map((w) => ({ week: w.week, stage: w.stage, price: w.price, floor: round(w.floor, 2) })),
  }
}

const sim = runSimulation()
const learner = sim.sahiDaam.learner

// ----------------------------------------------------------- the robustness

const SENSITIVITIES = [1.5, 2.2, 3.0]
const SEEDS = [sim.hidden.seed, 1, 2, 3, 4]

const runs = SENSITIVITIES.flatMap((epsilon) =>
  SEEDS.map((seed) => {
    const r = runSimulation({ epsilon, seed })
    const sahi = r.sahiDaam.summary.totalProfit
    const instinct = r.sellerInstinct.summary.totalProfit
    return {
      epsilon,
      seed,
      sahiDaamProfit: round(sahi),
      sellerInstinctProfit: round(instinct),
      gap: round(sahi - instinct),
      sahiDaamWins: sahi > instinct,
      sahiDaamWeeksBelowFloor: r.sahiDaam.summary.weeksBelowFloor,
      learnedSensitivity:
        r.sahiDaam.learner?.elasticityAverage != null
          ? round(r.sahiDaam.learner.elasticityAverage, 3)
          : null,
    }
  }),
)

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

// ---------------------------------------------------------------- the tests

function testCounts(): { passed: number; total: number; failed: number } {
  const out = join(tmpdir(), `sahi-daam-vitest-${process.pid}.json`)
  try {
    execSync(`npx vitest run --reporter=json --outputFile="${out}"`, {
      cwd: root,
      stdio: 'ignore',
    })
  } catch {
    // A failing suite still writes its report; the counts below say so.
  }
  const report = JSON.parse(readFileSync(out, 'utf8'))
  rmSync(out, { force: true })
  return {
    passed: report.numPassedTests,
    failed: report.numFailedTests,
    total: report.numTotalTests,
  }
}

// ------------------------------------------------------------------ output

const sahi = summarise(sim.sahiDaam)
const instinct = summarise(sim.sellerInstinct)

const results = {
  generatedAt: new Date().toISOString(),
  world: {
    weeks: sim.sahiDaam.weeks.length,
    seed: sim.hidden.seed,
    trueSensitivity: sim.hidden.epsilon,
    note: 'Synthetic world. Same seed, same noise draws and same scripted events for both strategies.',
  },
  strategies: {
    sahi_daam: sahi,
    seller_instinct: instinct,
  },
  gapAtWeek26: round(sim.sahiDaam.summary.totalProfit - sim.sellerInstinct.summary.totalProfit),
  alertsActedOnDefinition: ACTED_ON_DEFINITION,
  priceStepSequence: sim.sahiDaam.learnerSteps.map((s) => ({
    week: s.week,
    from: s.fromPrice,
    to: s.toPrice,
    improvementPct: round(s.improvement * 100, 1),
    kept: s.kept,
    sensitivityEstimate: s.elasticity !== null ? round(s.elasticity, 3) : null,
  })),
  peakPrice: learner?.bestPrice ?? null,
  sensitivity: {
    learned: learner?.elasticityAverage != null ? round(learner.elasticityAverage, 3) : null,
    true: sim.hidden.epsilon,
  },
  robustness: {
    sensitivities: SENSITIVITIES,
    seeds: SEEDS,
    runs: runs.length,
    sahiDaamWins: runs.filter((r) => r.sahiDaamWins).length,
    medianGap: round(median(runs.map((r) => r.gap))),
    minGap: round(Math.min(...runs.map((r) => r.gap))),
    maxGap: round(Math.max(...runs.map((r) => r.gap))),
    detail: runs,
  },
  tests: testCounts(),
}

const path = join(root, 'sim_results.json')
writeFileSync(path, JSON.stringify(results, null, 2) + '\n')
console.log(JSON.stringify(results, null, 2))
console.error(`\nwrote ${path}`)
