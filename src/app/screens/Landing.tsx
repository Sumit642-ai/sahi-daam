/**
 * Landing (spec v2, 7.1). No fixed rupee claim except the labelled example
 * (hard rule 2). The social-proof strip stays hidden until there are at least
 * 10 activated sellers (FLAGS.socialProof, built in Phase D).
 */
import { Link, Navigate } from 'react-router-dom'

import { useT } from '../../i18n'
import { useShop } from '../hooks'
import { Card, buttonClass } from '../ui'

export function Landing() {
  const t = useT()
  const shop = useShop()

  // A returning seller goes straight to their products.
  if (shop?.onboardedAt) return <Navigate to="/home" replace />

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center lg:gap-12">
      <section className="flex flex-col gap-5">
        <h1 className="text-3xl font-bold leading-tight text-ink md:text-4xl lg:text-5xl">{t('landing.headline')}</h1>
        <p className="text-lg text-body">{t('landing.sub')}</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link to="/start/language?next=upload" className={buttonClass('primary', 'text-lg')}>
            {t('landing.upload')}
          </Link>
          <Link to="/start/language?next=product" className={buttonClass('secondary', 'text-lg')}>
            {t('landing.manual')}
          </Link>
        </div>
        <Link to="/start/language?next=sample" className={buttonClass('ghost', 'self-start')}>
          {t('landing.sample')}
        </Link>
        <Link to="/how-it-works" className="inline-flex min-h-tap items-center self-start text-base font-medium text-plum underline underline-offset-4">
          {t('landing.how')}
        </Link>
      </section>

      <Card tone="peach" className="lg:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-thin">{t('landing.exampleLabel')}</p>
        <p className="mt-2 text-xl font-semibold text-ink md:text-2xl">{t('landing.example')}</p>
      </Card>
    </div>
  )
}
