/**
 * Every number the deck needs, recomputed from the engine the screens use.
 *
 *   npm run export:sim
 *
 * Writes sim_results.json (machine-readable) and NUMBERS.md (plain text, one
 * labelled number per line) at the repo root, and prints NUMBERS.md. Runs the
 * test suite for the pass count. Nothing here is typed in by hand except the
 * business-case inputs in section h, which are labelled as given.
 */
import { execSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { categories, fees } from '../src/data'
import { bandFor } from '../src/engine/band'
import {
  type FloorInput,
  costToServe,
  costToServeRange,
  defaultFloorInput,
  floorRange,
  sellerFloor,
} from '../src/engine/floor'
import { inr, pct } from '../src/engine/format'
import { recommend, verdictFor } from '../src/engine/recommend'
import { seasonIndex } from '../src/engine/season'
import {
  type StrategyRun,
  STRATEGY_LABEL,
  runSimulation,
} from '../src/engine/simulator'

const root = resolve(__dirname, '..')
const r2 = (n: number) => Math.round(n * 100) / 100
const r0 = (n: number) => Math.round(n)
const money = (n: number) => inr(n, 2)
const signed = (n: number) => `${n < 0 ? '−' : '+'}${inr(Math.abs(n), 2)}`

const lines: string[] = []
const out = (s = '') => lines.push(s)
const kv = (label: string, value: string) => out(`  ${label.padEnd(58)} ${value}`)

// ----------------------------------------------------------------- inputs
const KURTI: FloorInput = defaultFloorInput('ethnic_women', { cogs: 150, weightG: 350 })
const BEAUTY_DEMO_COGS = 152
const PRICE = 300

// =========================================================== a) the kurti
const range = floorRange(KURTI)
const cts = costToServeRange(KURTI)
const ctsDeck = costToServe({
  ...KURTI,
  unitOverrides: { rtoUnits: 17, returnUnits: 13, writeOffUnits: 6, cleanSales: 70 },
})
const seller = range.results.expected
const forwardOnRto = sellerFloor({ ...KURTI, policy: { forwardOnRto: true } })
const rates2026 = sellerFloor({ ...KURTI, policy: { rateSource: 'reported2026' } })

out('SAHI DAAM — NUMBERS FOR THE DECK')
out(`Generated ${new Date().toISOString()} by npm run export:sim. Every number below comes from the app's own engine.`)
out('Seller floor = what Meesho\'s published supplier policy charges the seller (no COD fee, no shipping on RTOs,')
out('forward fee on delivered orders, reverse fee on customer returns, 18% GST on both). Cost-to-serve = every')
out('logistics cost on every order plus COD handling, whoever pays it (the deck\'s original ₹318 model).')
out()
out('a) KURTI — ₹150 COGS, 350 g, Women\'s ethnic, March (baseline), DICE rates, default policy')
kv('Seller floor, most likely (15.7% returns)', money(range.expected))
kv(`Seller floor at ${pct(range.returnRates.low, 0)} returns`, money(range.low))
kv(`Seller floor at ${pct(range.returnRates.high, 0)} returns`, money(range.high))
kv('Full cost-to-serve, continuous model (15.7% returns)', money(cts.expected))
kv('Full cost-to-serve, deck rounded units (17 / 13 / 6 / 70)', money(ctsDeck.floor))
kv('Meesho absorbs per clean sale (RTO fwd + GST, RTO reverse, COD)', money(seller.absorbedPerCleanSale))
kv(`Profit per clean sale at ₹${PRICE} — seller floor`, signed(PRICE - range.expected))
kv(`Profit per clean sale at ₹${PRICE} — cost-to-serve`, signed(PRICE - cts.expected))
kv('Seller floor with "forward fee also charged on RTOs" (DISPUTED)', money(forwardOnRto.floor))
kv('Seller floor on 2026 reported rates (₹65 / ₹155, ASSUMPTION)', money(rates2026.floor))
kv(`Profit per clean sale at ₹${PRICE} on 2026 rates`, signed(PRICE - rates2026.floor))
out()

// ======================================================= b) the cost table
out('b) SELLER COST TABLE — kurti, per 100 orders dispatched (most likely return rate)')
out(`  ${'Line'.padEnd(44)} ${'Working'.padEnd(28)} ${'₹'.padStart(10)}  Who pays`)
for (const l of seller.costLines) {
  out(`  ${l.label.padEnd(44)} ${l.working.padEnd(28)} ${money(l.amount).padStart(10)}  You`)
}
kv('Total you pay', money(seller.totalOverhead))
kv(`÷ clean sales (${seller.cleanSales.toFixed(2)})`, money(seller.overheadPerCleanSale))
kv('+ COGS', money(KURTI.cogs))
kv('= Seller floor', money(seller.floor))
out('  Paid by Meesho, not in the seller floor:')
for (const l of seller.absorbedLines) {
  out(`  ${l.label.padEnd(44)} ${l.working.padEnd(28)} ${money(l.amount).padStart(10)}  Meesho`)
}
kv('Meesho total on 100 dispatched', money(seller.absorbedTotal))
kv('Meesho per clean sale', money(seller.absorbedPerCleanSale))
out()

// ========================================================= c) seasonality
out('c) SEASONALITY — kurti, March (baseline) vs November (festive peak)')
const season = (m: 'Mar' | 'Nov') => {
  const input = { ...KURTI, seasonIndex: seasonIndex(m) }
  const s = floorRange(input)
  const c = costToServeRange(input)
  return { idx: seasonIndex(m), rto: s.results.expected.rto, seller: s.expected, cts: c.expected }
}
const mar = season('Mar')
const nov = season('Nov')
for (const [name, row] of [['March', mar], ['November', nov]] as const) {
  kv(`${name}: season index`, `×${row.idx}`)
  kv(`${name}: RTO`, pct(row.rto))
  kv(`${name}: seller floor`, money(row.seller))
  kv(`${name}: cost-to-serve`, money(row.cts))
  kv(`${name}: profit per clean sale at ₹330 — seller`, signed(330 - row.seller))
  kv(`${name}: profit per clean sale at ₹330 — cost-to-serve`, signed(330 - row.cts))
}
kv('March → November change, seller floor', signed(nov.seller - mar.seller))
kv('March → November change, cost-to-serve', signed(nov.cts - mar.cts))
out()

// =========================================================== d) categories
out('d) CATEGORIES — category example product, typical price = median of the 40 sample listings')
out(`  ${'Category (example COGS, weight)'.padEnd(46)} ${'Typical'.padStart(8)} ${'Costs/sale'.padStart(11)} ${'% price'.padStart(8)} ${'Floor'.padStart(9)} ${'Margin'.padStart(8)}  Verdict at median`)
const categoryRows = categories.map((c) => {
  const input = defaultFloorInput(c.id)
  const r = floorRange(input)
  const band = bandFor(c.id)
  const median = band.p50
  const v = verdictFor({ price: median, input, range: r, band })
  const perSale = r.results.expected.overheadPerCleanSale
  return {
    id: c.id,
    name: c.name_en,
    cogs: input.cogs,
    weightG: input.weightG,
    typicalPrice: r2(median),
    sellerCostsPerCleanSale: r2(perSale),
    costsPctOfPrice: r2((perSale / median) * 100),
    sellerFloor: r2(r.expected),
    marginAtMedian: r2(v.marginPct * 100),
    verdictAtMedian: v.verdict,
  }
})
for (const c of categoryRows) {
  out(
    `  ${`${c.name} (₹${c.cogs}, ${c.weightG} g)`.padEnd(46)} ${inr(c.typicalPrice).padStart(8)} ${money(c.sellerCostsPerCleanSale).padStart(11)} ${`${c.costsPctOfPrice.toFixed(1)}%`.padStart(8)} ${money(c.sellerFloor).padStart(9)} ${`${c.marginAtMedian.toFixed(1)}%`.padStart(8)}  ${c.verdictAtMedian}`,
  )
}
out()

// ====================================================== e) not-viable demo
const beautyInput = defaultFloorInput('beauty', { cogs: BEAUTY_DEMO_COGS })
const beautyRange = floorRange(beautyInput)
const beautyBand = bandFor('beauty')
const beautyVerdict = verdictFor({ price: beautyBand.p50, input: beautyInput, range: beautyRange, band: beautyBand })
const beautyBelow = floorRange(defaultFloorInput('beauty', { cogs: BEAUTY_DEMO_COGS - 1 }))
out('e) NOT-VIABLE DEMO — lowest beauty product cost that is NOT VIABLE on the seller floor (DICE rates)')
kv('Category', 'Beauty & personal care (200 g)')
kv('COGS', inr(BEAUTY_DEMO_COGS))
kv('Seller floor', money(beautyRange.expected))
kv('Band p90 (the viability line)', money(beautyBand.p90))
kv(`One rupee cheaper (₹${BEAUTY_DEMO_COGS - 1}) — floor, verdict`, `${money(beautyBelow.expected)}, viable`)
kv('Verdict', beautyVerdict.verdict)
for (const f of beautyVerdict.fixes) {
  kv(`Fix: ${f.label}`, `new floor ${money(f.newFloor)} (${signed(f.delta)}) — ${f.viableNow ? 'viable on its own' : 'NOT viable on its own'}`)
}
out()

// ================================================================ f) launch
const launch = recommend('LAUNCH', range, bandFor('ethnic_women'))
out('f) LAUNCH RECOMMENDATION — default kurti')
kv('Launch price', inr(launch.price))
for (const line of launch.rationale) out(`    ${line}`)
out()

// =============================================================== g) journey
const sim = runSimulation()
const strategies = [sim.sahiDaam, sim.sellerInstinct, sim.meeshoRange] as const

function summarise(run: StrategyRun) {
  const s = run.summary
  const sold = run.weeks.reduce((n, w) => n + w.cleanSales, 0)
  const avgPrice = run.weeks.reduce((n, w) => n + w.price * w.cleanSales, 0) / sold
  const soldOut = run.weeks.find((w) => w.stockLeft <= 0.5)?.week ?? null
  const below = run.weeks.filter((w) => w.price < w.floor)
  return {
    strategy: run.strategy,
    label: STRATEGY_LABEL[run.strategy],
    week26Profit: r0(s.totalProfit),
    profitPerUnitSold: r2(s.totalProfit / s.unitsSold),
    weeksBelowSellerFloor: below.length,
    weeksBelowSellerFloorWithSales: below.filter((w) => w.orders > 0).length,
    unitsSold: r0(s.unitsSold),
    averagePrice: r2(avgPrice),
    soldOutWeek: soldOut,
    unitsRestocked: s.unitsRestocked,
    finalPrice: s.finalPrice,
    weeklyPrices: run.weeks.map((w) => ({ week: w.week, stage: w.stage, price: w.price, floor: r2(w.floor) })),
  }
}
const summaries = strategies.map(summarise)

out('g) 26-WEEK JOURNEY — one kurti, three strategies, same world (seed 20260706, true sensitivity 2.2), seller floor')
for (const s of summaries) {
  out(`  ${s.label}`)
  kv('  Week-26 cumulative profit', inr(s.week26Profit))
  kv('  Profit per unit sold', signed(s.profitPerUnitSold))
  kv('  Weeks priced below the seller floor', `${s.weeksBelowSellerFloor} (${s.weeksBelowSellerFloorWithSales} with sales)`)
  kv('  Units sold', String(s.unitsSold))
  kv('  Average selling price (weighted by units sold)', money(s.averagePrice))
  kv('  Sold-out week', s.soldOutWeek ? `week ${s.soldOutWeek}` : 'never sold out')
}
const gapInstinct = sim.sahiDaam.summary.totalProfit - sim.sellerInstinct.summary.totalProfit
const gapRange = sim.sahiDaam.summary.totalProfit - sim.meeshoRange.summary.totalProfit
kv('Gap, Sahi Daam vs seller instinct', inr(gapInstinct))
kv('Gap, Sahi Daam vs Meesho range', inr(gapRange))

const steps = sim.sahiDaam.learnerSteps
out('  Price-step sequence (Sahi Daam, ramp stage):')
for (const st of steps) {
  out(`    week ${String(st.week).padStart(2)}: ${inr(st.fromPrice)} → ${inr(st.toPrice)}  ${(st.improvement * 100).toFixed(1)}%  ${st.kept ? 'kept' : 'reverted'}  sensitivity estimate ${st.elasticity?.toFixed(2) ?? '—'}`)
}
kv('  Peak price found', inr(sim.sahiDaam.learner?.bestPrice ?? 0))
kv('  Learned price sensitivity', (sim.sahiDaam.learner?.elasticityAverage ?? NaN).toFixed(3))
kv('  True price sensitivity (hidden from the learner)', String(sim.hidden.epsilon))

const firedSahi = sim.sahiDaam.weeks.flatMap((w, i) =>
  w.alerts.map((a) => {
    const next = sim.sahiDaam.weeks[Math.min(i + 1, 25)]!
    const moved =
      next.price === w.price
        ? `held ₹${w.price}`
        : `price ₹${w.price} → ₹${next.price} the next week`
    return { week: w.week, id: a.id, title: a.title, action: a.action, taken: moved }
  }),
)
out('  Fired triggers (Sahi Daam) — week, trigger, what the alert said to do, what Sahi Daam did:')
for (const f of firedSahi) {
  out(`    week ${String(f.week).padStart(2)}  ${f.id} ${f.title}`)
  out(`             alert: ${f.action}`)
  out(`             done:  ${f.taken}`)
}

// Robustness: sensitivity 1.5 / 2.2 / 3.0 × 5 seeds.
const SENSITIVITIES = [1.5, 2.2, 3.0]
const SEEDS = [sim.hidden.seed, 1, 2, 3, 4]
const grid = SENSITIVITIES.flatMap((epsilon) =>
  SEEDS.map((seed) => {
    const r = runSimulation({ epsilon, seed })
    const learned = r.sahiDaam.learner?.elasticityAverage ?? null
    return {
      epsilon,
      seed,
      sahiDaam: r0(r.sahiDaam.summary.totalProfit),
      sellerInstinct: r0(r.sellerInstinct.summary.totalProfit),
      meeshoRange: r0(r.meeshoRange.summary.totalProfit),
      gapVsInstinct: r0(r.sahiDaam.summary.totalProfit - r.sellerInstinct.summary.totalProfit),
      gapVsRange: r0(r.sahiDaam.summary.totalProfit - r.meeshoRange.summary.totalProfit),
      sahiDaamWeeksBelowFloor: r.sahiDaam.summary.weeksBelowFloor,
      learnedSensitivity: learned === null ? null : Math.round(learned * 1000) / 1000,
      learnedError: learned === null ? null : Math.abs(learned - epsilon),
    }
  }),
)
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}
const stats = (key: 'gapVsInstinct' | 'gapVsRange') => {
  const gaps = grid.map((g) => g[key])
  return {
    wins: gaps.filter((g) => g > 0).length,
    median: r0(median(gaps)),
    min: Math.min(...gaps),
    max: Math.max(...gaps),
  }
}
const vsInstinct = stats('gapVsInstinct')
const vsRange = stats('gapVsRange')
const errors = grid.map((g) => g.learnedError).filter((e): e is number => e !== null)
const maxError = Math.max(...errors)
const worst = grid.find((g) => g.learnedError === maxError)!

out('  Robustness — sensitivity 1.5 / 2.2 / 3.0 × seeds 20260706, 1, 2, 3, 4 (15 runs):')
kv('  Sahi Daam beats seller instinct', `${vsInstinct.wins} of ${grid.length}`)
kv('    gap median / min / max', `${inr(vsInstinct.median)} / ${inr(vsInstinct.min)} / ${inr(vsInstinct.max)}`)
kv('  Sahi Daam beats Meesho range', `${vsRange.wins} of ${grid.length}`)
kv('    gap median / min / max', `${inr(vsRange.median)} / ${inr(vsRange.min)} / ${inr(vsRange.max)}`)
kv('  Sahi Daam weeks below floor, any run', String(Math.max(...grid.map((g) => g.sahiDaamWeeksBelowFloor))))
kv('  Max learned-sensitivity error', `${maxError.toFixed(3)} (true ${worst.epsilon}, seed ${worst.seed}, learned ${worst.learnedSensitivity?.toFixed(3)})`)
out('    run-by-run (sensitivity, seed: Sahi Daam / instinct / range):')
for (const g of grid) {
  out(`    ${g.epsilon.toFixed(1)}, ${String(g.seed).padEnd(8)}: ${inr(g.sahiDaam)} / ${inr(g.sellerInstinct)} / ${inr(g.meeshoRange)}`)
}
out()

// ========================================================= h) business case
const ANNUAL_ORDERS_MN = 1_261 * 2 // as given: 1,261 Mn orders in H1 FY26, doubled
const rtoCod = fees.rtoCod
const rtoPrepaid = fees.rtoPrepaid
const slab = seller.slab
const gst = fees.gstRate
const rtoCostToMeesho = slab.forward * (1 + gst) + slab.reverse
const perShiftedOrder = (rtoCod - rtoPrepaid) * rtoCostToMeesho + fees.codFee
const onePctOrdersMn = ANNUAL_ORDERS_MN / 100
const savingCr = (onePctOrdersMn * 1e6 * perShiftedOrder) / 1e7

out('h) BUSINESS CASE — moving one order from COD to prepaid (≤500 g, DICE rates)')
kv('Expected RTO, COD → prepaid', `${pct(rtoCod, 0)} → ${pct(rtoPrepaid, 0)} (−${((rtoCod - rtoPrepaid) * 100).toFixed(0)} points)`)
kv('Cost to Meesho of one RTO (fwd ₹50 + 18% GST + reverse ₹120)', money(rtoCostToMeesho))
kv('RTO cost avoided per shifted order (15% × that)', money((rtoCod - rtoPrepaid) * rtoCostToMeesho))
kv('COD handling avoided per shifted order (ASSUMPTION ₹7)', money(fees.codFee))
kv('Meesho saving per shifted order', money(perShiftedOrder))
kv('Annual orders (as given: 1,261 Mn in H1 FY26 × 2)', `${ANNUAL_ORDERS_MN.toLocaleString('en-IN')} Mn`)
kv('1% of annual orders', `${onePctOrdersMn.toFixed(2)} Mn`)
kv('Meesho saving per 1% of orders moved to prepaid', `₹${savingCr.toFixed(1)} Cr a year`)
out()

// =================================================================== i) tests
function testCounts() {
  const file = join(tmpdir(), `sahi-daam-vitest-${process.pid}.json`)
  try {
    execSync(`npx vitest run --reporter=json --outputFile="${file}"`, { cwd: root, stdio: 'ignore' })
  } catch {
    // A failing suite still writes its report; the counts say so.
  }
  const report = JSON.parse(readFileSync(file, 'utf8'))
  rmSync(file, { force: true })
  return { passed: report.numPassedTests as number, failed: report.numFailedTests as number, total: report.numTotalTests as number }
}
const tests = testCounts()
out('i) TESTS')
kv('Passed / total', `${tests.passed} / ${tests.total}${tests.failed ? ` (${tests.failed} FAILED)` : ''}`)

// ================================================================== write
const md = lines.join('\n') + '\n'
writeFileSync(join(root, 'NUMBERS.md'), md)

const json = {
  generatedAt: new Date().toISOString(),
  model: 'sellerFloor (Meesho supplier policy); costToServe shown alongside',
  kurti: {
    sellerFloor: { low: r2(range.low), mostLikely: r2(range.expected), high: r2(range.high) },
    costToServe: { continuous: r2(cts.expected), deckRoundedUnits: ctsDeck.floor },
    meeshoAbsorbsPerCleanSale: r2(seller.absorbedPerCleanSale),
    profitAt300: { seller: r2(PRICE - range.expected), costToServe: r2(PRICE - cts.expected) },
    sellerFloorForwardOnRto: r2(forwardOnRto.floor),
    sellerFloor2026Rates: r2(rates2026.floor),
    profitAt300On2026Rates: r2(PRICE - rates2026.floor),
    launchPrice: launch.price,
  },
  seasonality: { march: mar, november: nov },
  categories: categoryRows,
  notViableDemo: {
    categoryId: 'beauty',
    cogs: BEAUTY_DEMO_COGS,
    sellerFloor: r2(beautyRange.expected),
    bandP90: beautyBand.p90,
    fixes: beautyVerdict.fixes.map((f) => ({ id: f.id, label: f.label, newFloor: r2(f.newFloor), viableNow: f.viableNow })),
  },
  journey: {
    world: { weeks: 26, seed: sim.hidden.seed, trueSensitivity: sim.hidden.epsilon },
    strategies: summaries,
    gapVsSellerInstinct: r0(gapInstinct),
    gapVsMeeshoRange: r0(gapRange),
    priceStepSequence: steps.map((st) => ({
      week: st.week,
      from: st.fromPrice,
      to: st.toPrice,
      improvementPct: r2(st.improvement * 100),
      kept: st.kept,
      sensitivityEstimate: st.elasticity === null ? null : r2(st.elasticity),
    })),
    peakPrice: sim.sahiDaam.learner?.bestPrice ?? null,
    sensitivity: { learned: r2(sim.sahiDaam.learner?.elasticityAverage ?? NaN), true: sim.hidden.epsilon },
    firedTriggers: firedSahi,
    robustness: {
      sensitivities: SENSITIVITIES,
      seeds: SEEDS,
      runs: grid.length,
      vsSellerInstinct: vsInstinct,
      vsMeeshoRange: vsRange,
      maxLearnedSensitivityError: r2(maxError * 1000) / 1000,
      detail: grid,
    },
  },
  businessCase: {
    annualOrdersMn: ANNUAL_ORDERS_MN,
    savingPerShiftedOrder: r2(perShiftedOrder),
    savingPerOnePercentCrPerYear: r2(savingCr),
  },
  tests,
}
writeFileSync(join(root, 'sim_results.json'), JSON.stringify(json, null, 2) + '\n')

console.log(md)
console.error(`wrote ${join(root, 'NUMBERS.md')} and ${join(root, 'sim_results.json')}`)
