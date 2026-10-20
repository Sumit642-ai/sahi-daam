/** Smaller screens: Privacy (spec v2, section 9), 404, and the error screen. */
import { Link } from 'react-router-dom'

import { useT } from '../../i18n'
import { PageTitle, buttonClass } from '../ui'

const SECTIONS = [
  ['privacy.storedTitle', ['privacy.stored1', 'privacy.stored2', 'privacy.stored3']],
  ['privacy.neverTitle', ['privacy.never1', 'privacy.never2']],
  ['privacy.sentTitle', ['privacy.sent1', 'privacy.sent2', 'privacy.sent3', 'privacy.sent4']],
  ['privacy.deleteTitle', ['privacy.delete1', 'privacy.delete2']],
] as const

export function Privacy() {
  const t = useT()
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageTitle>{t('privacy.title')}</PageTitle>
      <p className="text-lg text-body">{t('privacy.lead')}</p>
      {SECTIONS.map(([title, items]) => (
        <section key={title}>
          <h2 className="text-xl font-semibold text-ink">{t(title)}</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-base text-body">
            {items.map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-sm text-muted">{t('privacy.contactNote')}</p>
    </div>
  )
}

export function NotFound() {
  const t = useT()
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-10">
      <PageTitle>{t('notFound.title')}</PageTitle>
      <Link to="/" className={buttonClass('primary')}>
        {t('notFound.home')}
      </Link>
    </div>
  )
}

/** Never a blank or raw crash screen (spec 13): data lives in IndexedDB, so a reload loses nothing. */
export function RouteError() {
  const t = useT()
  return (
    <div className="pt-safe mx-auto flex min-h-dvh max-w-xl flex-col items-start justify-center gap-4 px-4 py-10">
      <PageTitle>{t('crash.title')}</PageTitle>
      <p className="text-lg text-body">{t('crash.body')}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={() => window.location.reload()} className={buttonClass('primary')}>
          {t('crash.reload')}
        </button>
        <a href="/home" className={buttonClass('secondary')}>
          {t('notFound.home')}
        </a>
      </div>
    </div>
  )
}
