/**
 * Prints the deck's worked example as the cost table Screen 1 will render
 * (spec section 9.2), so the ₹318 can be eyeballed line by line.
 *
 *   npm run verify:deck
 */
import { defaultFloorInput, floor, floorRange, profitPerCleanSale } from '../src/engine/floor'
import { inr, pct } from '../src/engine/format'

const base = defaultFloorInput('ethnic_women', { cogs: 150, weightG: 350 })

const deck = floor({
  ...base,
  unitOverrides: { rtoUnits: 17, returnUnits: 13, writeOffUnits: 6, cleanSales: 70 },
})

const W = 44
const rule = (ch: string) => console.log('  ' + ch.repeat(W + 22 + 12))

console.log('')
console.log('DECK WORKED EXAMPLE — kurti, COGS ₹150, 350 g, 100 orders dispatched')
console.log('')
console.log(
  `  Funnel:  100 dispatched  →  ${deck.deliveredUnits} delivered  →  ${deck.cleanSales} clean sales`,
)
console.log(
  `           leak: ${deck.rtoUnits} RTO (${pct(deck.rtoUnits / 100, 0)})` +
    `, ${deck.returnUnits} returned, of which ${deck.writeOffUnits} unsellable`,
)
console.log('')
rule('─')
for (const line of deck.costLines) {
  console.log(
    '  ' + line.label.padEnd(W) + line.working.padEnd(22) + inr(line.amount).padStart(12),
  )
}
rule('─')
console.log('  ' + 'Total overhead on 100 dispatched'.padEnd(W + 22) + inr(deck.totalOverhead).padStart(12))
console.log('  ' + `÷ clean sales (${deck.cleanSales})`.padEnd(W + 22) + inr(deck.overheadPerCleanSale).padStart(12))
console.log('  ' + '+ COGS'.padEnd(W + 22) + inr(deck.input.cogs).padStart(12))
rule('═')
console.log('  ' + 'YOUR TRUE FLOOR'.padEnd(W + 22) + inr(deck.floor).padStart(12))
rule('═')
console.log('')
console.log(`  At a list price of ₹300:`)
console.log(`    the seller thinks they earn   ${inr(300 - deck.input.cogs)}   (₹300 − COGS ₹150)`)
console.log(`    they actually earn            ${inr(profitPerCleanSale(300, deck.floor))}   (₹300 − floor ₹318)`)
console.log('')

const range = floorRange(base)
console.log('CONTINUOUS MODEL (no rounded unit overrides)')
console.log(
  `  return rate ${pct(range.returnRates.low, 0)} (low)      → floor ${inr(range.low, 2)}`,
)
console.log(
  `  return rate ${pct(range.returnRates.expected, 0)} (expected) → floor ${inr(range.expected, 2)}`,
)
console.log(
  `  return rate ${pct(range.returnRates.high, 0)} (high)     → floor ${inr(range.high, 2)}`,
)
console.log('')
