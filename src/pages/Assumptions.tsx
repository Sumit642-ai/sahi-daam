import { useMemo, useState } from 'react'

import { type SourcedEntry, sourcedEntries } from '../data'
import { num } from '../engine/format'
import { useI18n } from '../i18n'
import { Card, CardTitle } from '../components/Card'

/**
 * Screen 6 — Assumptions & sources (spec section 9.7).
 *
 * Every configuration value in the prototype, searchable, each with the
 * citation it came from or an ASSUMPTION badge. This is the screen that makes
 * the rest of the product checkable rather than merely plausible — including
 * the simulator's hidden demand parameters, which the learner is not allowed to
 * see but a judge certainly should.
 */

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

  const assumedCount = all.filter((e) => e.isAssumption).length

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
        <p className="mt-2 text-[11px] text-body/60">
          {t('assumptions.showing', {
            shown: filtered.length,
            total: all.length,
            assumed: assumedCount,
          })}
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
                hint={t('assumptions.showing', {
                  shown: entries.length,
                  total: all.length,
                  assumed: entries.filter((e) => e.isAssumption).length,
                })}
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
                            className={`mr-1.5 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                              entry.isAssumption
                                ? 'bg-body/10 text-body'
                                : 'bg-profit/15 text-profit'
                            }`}
                          >
                            {entry.isAssumption ? t('tag.assumption') : t('assumptions.cited')}
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
