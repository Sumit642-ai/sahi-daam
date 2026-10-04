import { useMemo, useState } from 'react'

import { type SourceKind, type SourcedEntry, sourcedEntries } from '../data'
import { num } from '../engine/format'
import { type TranslationKey, useI18n } from '../i18n'
import { Card, CardTitle } from '../components/Card'

/**
 * Screen 6 — Numbers & sources.
 *
 * Every configuration value in the prototype, searchable, each with the
 * citation it came from or an ASSUMPTION badge. This is the screen that makes
 * the rest of the product checkable rather than merely plausible — including
 * the simulator's hidden demand parameters, which the learner is not allowed to
 * see but a judge certainly should.
 */

const BADGE: Record<SourceKind, { key: TranslationKey; className: string }> = {
  CITED: { key: 'assumptions.cited', className: 'bg-profit/15 text-profit' },
  DERIVED: { key: 'assumptions.derived', className: 'bg-plum/10 text-plum' },
  CONVENTION: { key: 'assumptions.convention', className: 'bg-orange/15 text-[#8A4408]' },
  DISPUTED: { key: 'assumptions.disputed', className: 'bg-magenta/10 text-magenta' },
  ASSUMPTION: { key: 'tag.assumption', className: 'bg-body/10 text-body' },
}

function formatValue(entry: SourcedEntry): string {
  if (typeof entry.value === 'string') return entry.value
  // Shares read better as percentages; everything else as an Indian-grouped number.
  if (entry.unit.includes('share') || entry.unit.includes('%')) {
    return `${num(entry.value * 100, entry.value * 100 < 10 ? 1 : 0)}%`
  }
  return num(entry.value, Number.isInteger(entry.value) ? 0 : 3)
}

export function Assumptions() {
  const { t, lang } = useI18n()
  const [query, setQuery] = useState('')

  const all = useMemo(() => sourcedEntries(), [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return all
    return all.filter((entry) =>
      [entry.group, entry.key, entry.label_en, entry.label_hi, entry.unit, entry.source, String(entry.value)]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [all, query])

  const grouped = useMemo(() => {
    const map = new Map<string, SourcedEntry[]>()
    for (const entry of filtered) {
      const list = map.get(entry.group) ?? []
      list.push(entry)
      map.set(entry.group, list)
    }
    return [...map.entries()]
  }, [filtered])

  // The pricing model is what a seller's floor is built from, so its sourcing
  // is what gets counted. Conventions are modelling choices, not claims, and
  // are left out of both sides of the count.
  const pricing = all.filter((e) => e.domain === 'pricing' && e.kind !== 'CONVENTION')
  const pricingBacked = pricing.filter((e) => e.kind === 'CITED' || e.kind === 'DERIVED').length
  const conventions = all.filter((e) => e.kind === 'CONVENTION').length

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-plum sm:text-3xl">
          {t('assumptions.title')}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-body">{t('assumptions.lead')}</p>
      </div>

      <Card tone="peach">
        <p className="text-sm leading-relaxed text-body">{t('assumptions.note')}</p>
        <p className="mt-2 text-xs leading-relaxed text-body/70">{t('assumptions.noScrape')}</p>
      </Card>

      <Card tone="white" className="mt-4">
        <label className="block">
          <span className="sr-only">{t('assumptions.search')}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('assumptions.search')}
            className="w-full rounded-lg bg-lilac px-4 py-3 text-sm text-plum-deep outline-none ring-0 transition-shadow placeholder:text-body/50 focus:ring-2 focus:ring-plum/40"
          />
        </label>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <p className="rounded-lg bg-profit/10 px-3 py-2 text-xs font-semibold text-plum-deep">
            {t('assumptions.pricingSummary', { backed: pricingBacked, total: pricing.length })}
          </p>
          <p className="rounded-lg bg-lilac px-3 py-2 text-xs font-semibold text-plum-deep">
            {t('assumptions.simSummary')}
          </p>
        </div>
        <p className="mt-2 text-[11px] text-body/60">
          {t('assumptions.showingOnly', { shown: filtered.length, total: all.length })} ·{' '}
          {t('assumptions.conventionNote', { count: conventions })}
        </p>
      </Card>

      {grouped.length === 0 ? (
        <Card tone="lilac" className="mt-4">
          <p className="text-sm text-body">{t('assumptions.none')}</p>
        </Card>
      ) : (
        <div className="mt-4 space-y-4">
          {grouped.map(([group, entries]) => (
            <Card key={group} tone="white">
              <CardTitle
                hint={
                  entries[0]?.domain === 'simulator'
                    ? t('assumptions.simSummary')
                    : t('assumptions.groupCount', {
                        backed: entries.filter((e) => e.kind === 'CITED' || e.kind === 'DERIVED')
                          .length,
                        total: entries.length,
                      })
                }
              >
                {group}
              </CardTitle>

              <div className="-mx-2 overflow-x-auto">
                <table className="w-full table-auto">
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="px-2 pb-1 text-left text-[10px] font-semibold uppercase tracking-wide text-body/50"
                      >
                        {t('assumptions.colName')}
                      </th>
                      <th
                        scope="col"
                        className="px-2 pb-1 text-right text-[10px] font-semibold uppercase tracking-wide text-body/50"
                      >
                        {t('assumptions.colValue')}
                      </th>
                      <th
                        scope="col"
                        className="hidden px-2 pb-1 text-left text-[10px] font-semibold uppercase tracking-wide text-body/50 sm:table-cell"
                      >
                        {t('assumptions.colSource')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, i) => (
                      <tr key={entry.key} className={i % 2 === 1 ? 'bg-lilac/60' : ''}>
                        <th
                          scope="row"
                          className="px-2 py-2 text-left align-top text-xs font-normal text-body"
                        >
                          <span className="block font-medium text-plum-deep">
                            {lang === 'hi' ? entry.label_hi : entry.label_en}
                          </span>
                          <span className="block font-mono text-[10px] text-body/50">
                            {entry.key}
                          </span>
                        </th>
                        <td className="whitespace-nowrap px-2 py-2 text-right align-top text-xs font-semibold tabular-nums text-plum-deep">
                          {formatValue(entry)}
                          <span className="block text-[10px] font-normal text-body/50">
                            {entry.unit}
                          </span>
                        </td>
                        <td className="px-2 py-2 align-top text-[11px] leading-snug text-body/70">
                          <span
                            className={`mr-1.5 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${BADGE[entry.kind].className}`}
                          >
                            {t(BADGE[entry.kind].key)}
                          </span>
                          {entry.source.trim().toUpperCase() === 'ASSUMPTION' ? null : (
                            <span>{entry.source}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
