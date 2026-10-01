/**
 * Prints the 26-week journey as a table, both strategies side by side.
 *   npm run verify:journey
 */
import { inr } from '../src/engine/format'
import { runSimulation } from '../src/engine/simulator'

const sim = runSimulation()
const f = (n: number, w = 7) => Math.round(n).toLocaleString('en-IN').padStart(w)

console.log('')
console.log('RAMESH KI KAHANI - 26 weeks, one kurti, two strategies on one world')
console.log('')
console.log('wk  date        stage    |  SAHI DAAM: price floor  ord   profit      cum  stock | INSTINCT: price   profit      cum')
console.log('-'.repeat(118))
for (let i = 0; i < sim.sahiDaam.weeks.length; i += 1) {
  const a = sim.sahiDaam.weeks[i]!
  const b = sim.sellerInstinct.weeks[i]!
  console.log(
    String(a.week).padStart(2), a.date, a.stage.padEnd(8), '|',
    f(a.price, 16), f(a.floor, 5), f(a.orders, 4), f(a.profit, 8), f(a.cumulativeProfit, 8), f(a.stockLeft, 6), '|',
    f(b.price, 14), f(b.profit, 8), f(b.cumulativeProfit, 8),
  )
}
console.log('')
for (const run of [sim.sahiDaam, sim.sellerInstinct]) {
  const s = run.summary
  console.log(
    run.strategy.padEnd(16),
    'profit', inr(s.totalProfit).padStart(10),
    '| weeks below floor', String(s.weeksBelowFloor).padStart(2),
    '| sold', f(s.unitsSold, 5),
    '| stock left', f(s.stockLeft, 4),
    '| reordered', f(s.unitsRestocked, 4),
    '| final', inr(s.finalPrice).padStart(5),
  )
}
console.log('\ngap:', inr(sim.sahiDaam.summary.totalProfit - sim.sellerInstinct.summary.totalProfit))
console.log('\nLEARNER (spec section 6.5)')
for (const s of sim.sahiDaam.learnerSteps) {
  console.log(
    `  week ${String(s.week).padStart(2)}  ${inr(s.fromPrice)} -> ${inr(s.toPrice)}`.padEnd(30),
    `${(s.improvement * 100).toFixed(1)}%`.padStart(7),
    s.kept ? 'KEPT  ' : 'REVERT',
    s.elasticity !== null ? `eps-hat ${s.elasticity.toFixed(2)}` : '',
  )
}
console.log(`  peak ${inr(sim.sahiDaam.learner?.bestPrice ?? 0)} | running eps-hat ${sim.sahiDaam.learner?.elasticityAverage?.toFixed(3)} | true eps ${sim.hidden.epsilon} (hidden)`)
console.log('\nALERTS RAISED')
for (const w of sim.sahiDaam.weeks) {
  for (const a of w.alerts) console.log(`  week ${String(w.week).padStart(2)}  ${a.id}  ${a.title}`)
}
console.log('')
