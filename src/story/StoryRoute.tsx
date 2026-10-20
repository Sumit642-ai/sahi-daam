/**
 * /how-it-works: the prototype's judge pages, unchanged (MVP spec v2, 7.13),
 * behind a thin bar back to the seller app. Loaded lazily with Recharts.
 */
import { Link } from 'react-router-dom'

import { Footer } from '../app/layout'
import { useI18n } from '../i18n'
import StoryApp from './StoryApp'

export function Component() {
  const { t, lang } = useI18n()
  return (
    <div className="pl-safe pr-safe min-h-dvh">
      <div className="pt-safe bg-plum-deep">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 px-4 sm:px-6">
          <Link to="/" className="inline-flex min-h-tap items-center gap-1 text-sm font-semibold text-white">
            <span aria-hidden="true">←</span>
            {t('story.back')}
          </Link>
          <span className="py-2 text-sm text-white/70">{t('story.label')}</span>
        </div>
      </div>
      <StoryApp initialLang={lang} />
      <Footer />
    </div>
  )
}
