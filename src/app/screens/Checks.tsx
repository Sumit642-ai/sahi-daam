/**
 * Checks (spec v2, 7.8; called "Checks", not "Alerts", until real push
 * exists). Each check: a title, one line with the numbers, one action,
 * share, dismiss. Plus "Remind me every Monday" (.ics) and the Pro waitlist.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'

import { inr } from '../../engine/format'
import { type MessageKey, useI18n } from '../../i18n'
import { type Check, db } from '../db'
import { downloadFile, mondayReminderIcs } from '../lib/ics'
import { dismissCheck } from '../repo'
import { track, whatsappLink } from '../telemetry'
import { Button, Card, LoadingPage, PageTitle, buttonClass } from '../ui'
import { ProWaitlistCard } from './Growth'

const ACTION_TO: Record<Check['rule'], (productId?: string) => string> = {
  C1: (id) => `/products/${id}/price`,
  C2: (id) => `/products/${id}`,
  C3: (id) => `/products/${id}`,
  C4: (id) => `/products/${id}/price`,
  C5: (id) => `/products/${id}/price`,
  C6: () => '/home',
  C7: (id) => `/products/${id}`,
}

export function Checks() {
  const { t } = useI18n()
  const checks = useLiveQuery(() => db.checks.where('status').equals('active').reverse().sortBy('createdAt'), [])
  const products = useLiveQuery(() => db.products.toArray(), [])
  if (checks === undefined || products === undefined) return <LoadingPage />
  const nameOf = (id?: string) => products.find((p) => p.id === id)?.name ?? ''

  const remind = () =>
    downloadFile(
      'sahi-daam-monday.ics',
      mondayReminderIcs({ appUrl: `${window.location.origin}/checks`, title: t('ics.title'), description: t('ics.description') }),
      'text/calendar;charset=utf-8',
    )

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageTitle>{t('checks.title')}</PageTitle>

      {checks.length === 0 ? (
        <Card tone="lilac">
          <h2 className="text-lg font-semibold text-ink">{t('checks.emptyTitle')}</h2>
          <p className="mt-2 text-base text-body">{t('checks.emptyBody')}</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {checks.map((c) => (
            <li key={c.id}>
              <CheckCard check={c} product={nameOf(c.productId)} />
            </li>
          ))}
        </ul>
      )}

      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-ink">{t('checks.remind')}</h2>
        <p className="text-base text-body">{t('checks.remindHint')}</p>
        <Button variant="secondary" className="self-start" onClick={remind}>
          {t('checks.remindCta')}
        </Button>
      </Card>

      <ProWaitlistCard />
    </div>
  )
}

export function checkLine(t: (k: MessageKey, v?: Record<string, string | number>) => string, check: Check, product: string): string {
  const p = check.payload as Record<string, number | string>
  const money = (v: unknown) => inr(Number(v))
  switch (check.rule) {
    case 'C1':
      return t('check.C1.line', { product, price: money(p.price), floor: money(p.floor) })
    case 'C2':
      return t('check.C2.line', { product, from: String(p.from), to: String(p.to) })
    case 'C3':
      return t('check.C3.line', { product, from: String(p.from), to: String(p.to) })
    case 'C4':
      return t('check.C4.line', { product, from: money(p.from), to: money(p.to) })
    case 'C5':
      return t('check.C5.line', { product, median: money(p.median), gap: String(p.gap), price: money(p.price) })
    case 'C6':
      return t('check.C6.line', { cod: String(p.cod) })
    case 'C7':
      return p.verdict === 'KEEP'
        ? t('check.C7.keep', { product, from: money(p.from), to: money(p.to) })
        : t('check.C7.goBack', { product, from: money(p.from), to: money(p.to) })
  }
}

function CheckCard({ check, product }: { check: Check; product: string }) {
  const { t } = useI18n()
  const title = t(`check.${check.rule}.title` as MessageKey)
  const line = checkLine(t, check, product)
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="text-base text-body">{line}</p>
      <div className="mt-1 flex flex-wrap gap-2">
        <Link to={ACTION_TO[check.rule](check.productId)} className={buttonClass('primary')}>
          {t(`check.${check.rule}.action` as MessageKey)}
        </Link>
        <a
          href={whatsappLink(`${title}: ${line}`)}
          target="_blank"
          rel="noreferrer"
          onClick={() => void track('share_clicked', { kind: 'CHECK' })}
          className={buttonClass('ghost')}
        >
          {t('checks.share')}
        </a>
        <Button variant="ghost" onClick={() => void dismissCheck(check.id)}>
          {t('checks.dismiss')}
        </Button>
      </div>
    </Card>
  )
}
