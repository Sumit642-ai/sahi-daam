/**
 * Renders Screen 1 exactly as the browser gets it and prints the cost table,
 * headline and funnel back as text, so the deck reproduction can be checked
 * without opening a browser.
 *
 *   npm run verify:screen1
 */
import { renderToStaticMarkup } from 'react-dom/server'

import { ExpandAllContext } from '../src/components/ShowWorking'
import { FloorCalculator } from '../src/pages/FloorCalculator'

const html = renderToStaticMarkup(
  <ExpandAllContext.Provider value={false}>
    <FloorCalculator />
  </ExpandAllContext.Provider>,
)

const text = (fragment: string) =>
  fragment
    .replace(/<[^>]*>/g, '')
    .split('')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/&rsquo;/g, '’')
    .replace(/&amp;/g, '&')

/** Every <tr> in the document, as [cell, cell, …]. */
function rows(markup: string): string[][] {
  const out: string[][] = []
  for (const tr of markup.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const cells = (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/g) ?? []).map(text)
    if (cells.length) out.push(cells)
  }
  return out
}

function section(heading: string) {
  console.log('\n' + heading)
  console.log('─'.repeat(78))
}

// The floor headline, verbatim from the rendered markup.
section('FLOOR HEADLINE (rendered)')
const headline = html.match(/below this you lose money[\s\S]*?<\/dl>/)
console.log('  ' + text(headline?.[0] ?? '(not found)'))

// The seven cost lines plus the summary block.
section('COST TABLE (rendered) — label | working | on 100 dispatched')
for (const cells of rows(html)) {
  if (cells.length !== 3) continue
  const [label, working, amount] = cells as [string, string, string]
  if (label.toLowerCase().includes('cost line')) continue
  // The amount cell repeats the working for the mobile layout; drop the echo.
  const clean = amount.replace(working, '').trim()
  console.log('  ' + label.replace(/ Show working.*$/, '').padEnd(44) + working.padEnd(22) + clean.padStart(11))
}

section('FUNNEL (rendered)')
for (const line of text(html.match(/Orders dispatched[\s\S]*?orders you packed/)?.[0] ?? '').split(
  /(?=Orders dispatched|Delivered to the buyer|Clean sales \(kept)/,
)) {
  if (line.trim()) console.log('  ' + line.trim())
}

section('PROVENANCE TAGS (rendered counts)')
for (const tag of ['You enter', 'Meesho fills', 'Assumption']) {
  const n = (html.match(new RegExp(`>${tag}<`, 'g')) ?? []).length
  console.log(`  ${tag.padEnd(14)} ${n} field${n === 1 ? '' : 's'}`)
}
const info = (html.match(/aria-expanded="false"/g) ?? []).length
console.log(`  Show working   ${info} collapsed ⓘ panels`)
console.log('')
