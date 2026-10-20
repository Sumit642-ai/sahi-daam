/**
 * /stats?key=<secret> (spec v2, section 10): the team's private numbers.
 *
 * The key comes from the URL and is checked inside the database function
 * public.sahi_daam_stats(); it is never stored in the app's code. Team
 * devices (?team=1) are excluded by that function. Not linked anywhere.
 */
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { num } from '../../engine/format'
import { useT } from '../../i18n'
import { type Stats as StatsData, fetchStats } from '../telemetry'
import { Card, LoadingPage, PageTitle } from '../ui'

type State = { kind: 'loading' } | { kind: 'ok'; stats: StatsData } | { kind: 'error'; reason: 'not_configured' | 'forbidden' | 'error' }

const METRICS = ['activated', 'reports', 'products_checked', 'products_losing', 'referrals', 'waitlist'] as const

export function Stats() {
  const t = useT()
  const [params] = useSearchParams()
  const key = params.get('key') ?? ''
  const [state, setState] = useState<State>({ kind: 'loading' })

  // The key is read once, on arrival, then taken out of the address bar.
  useEffect(() => {
    if (key) window.history.replaceState(window.history.state, '', '/stats')
    void fetchStats(key).then((r) => setState(r.ok ? { kind: 'ok', stats: r.stats } : { kind: 'error', reason: r.reason }))
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex'
    document.head.appendChild(robots)
    return () => robots.remove()
  }, [])

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageTitle>{t('stats.title')}</PageTitle>
      {state.kind === 'loading' ? <LoadingPage /> : null}
      {state.kind === 'error' ? (
        <Card tone="peach">
          <p role="alert" className="text-base font-medium text-thin">
            {t(`stats.${state.reason}`)}
          </p>
        </Card>
      ) : null}
      {state.kind === 'ok' ? (
        <>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {METRICS.map((m) => (
              <li key={m}>
                <Card className="h-full">
                  <p className="text-sm text-muted">{t(`stats.${m}`)}</p>
                  <p className="text-3xl font-bold text-ink">{num(Number(state.stats.totals[m] ?? 0))}</p>
                </Card>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">{t('stats.teamNote')}</p>
          <section>
            <h2 className="mb-2 text-lg font-semibold text-ink">{t('stats.byDay')}</h2>
            <div className="overflow-x-auto rounded-card border border-plum/15">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-lilac">
                  <tr>
                    <th scope="col" className="px-3 py-2">
                      {t('stats.day')}
                    </th>
                    {METRICS.map((m) => (
                      <th key={m} scope="col" className="whitespace-nowrap px-3 py-2">
                        {t(`stats.${m}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.stats.by_day.map((d) => (
                    <tr key={d.day} className="border-t border-plum/10">
                      <td className="whitespace-nowrap px-3 py-2">{d.day}</td>
                      {METRICS.map((m) => (
                        <td key={m} className="px-3 py-2">
                          {num(Number(d[m] ?? 0))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
