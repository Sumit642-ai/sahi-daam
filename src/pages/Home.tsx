import { inr } from '../engine/format'
import { useI18n } from '../i18n'
import { Card } from '../components/Card'
import { useProduct } from '../state/productInputs'

/**
 * Screen 0 — Home (spec section 9.1).
 *
 * Two large entry cards, the one-line problem statement, and the hook that the
 * whole product exists to deliver: ₹150 against −₹18 on the same kurti.
 */
interface HomeProps {
  onOpenFloor: () => void
  onOpenJourney: () => void
  onOpenCompare: () => void
}

export function Home({ onOpenFloor, onOpenJourney, onOpenCompare }: HomeProps) {
  const { t } = useI18n()
  const { deck } = useProduct()

  // The deck's kurti, which is what the hook quotes.
  const deckFloor = deck?.floor ?? 318
  const imagined = 300 - 150
  const actual = 300 - deckFloor

  const cards = [
    {
      key: 'floor',
      title: t('home.card1.title'),
      body: t('home.card1.body'),
      cta: t('home.card1.cta'),
      onClick: onOpenFloor,
      tone: 'plum' as const,
    },
    {
      key: 'journey',
      title: t('home.card2.title'),
      body: t('home.card2.body'),
      cta: t('home.card2.cta'),
      onClick: onOpenJourney,
      tone: 'peach' as const,
    },
    {
      key: 'compare',
      title: t('home.card3.title'),
      body: t('home.card3.body'),
      cta: t('home.card3.cta'),
      onClick: onOpenCompare,
      tone: 'lilac' as const,
    },
  ]

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-4xl font-bold tracking-tight text-plum sm:text-6xl">
        {t('home.title')}
      </h1>
      <p className="mt-2 max-w-3xl text-base leading-relaxed text-body sm:text-lg">
        {t('home.lead')}
      </p>

      {/* ------------------------------------------------------------- the hook */}
      <Card tone="lilac" className="mt-7">
        <div className="grid gap-5 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-body/70">
              {t('home.hookThink')}
            </p>
            <p className="mt-1 text-5xl font-bold leading-none tracking-tight text-orange sm:text-6xl">
              {inr(imagined)}
            </p>
          </div>

          <div
            aria-hidden="true"
            className="hidden h-16 w-px bg-plum/15 sm:block"
          />

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-body/70">
              {t('home.hookActual')}
            </p>
            <p className="mt-1 text-5xl font-bold leading-none tracking-tight text-magenta sm:text-6xl">
              −{inr(Math.abs(actual))}
            </p>
          </div>
        </div>

        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-body">
          {t('home.hookCaption')}
        </p>
      </Card>

      {/* ----------------------------------------------------------- entry cards */}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={card.onClick}
            className={`group rounded-card p-6 text-left transition-colors ${
              card.tone === 'plum'
                ? 'bg-plum hover:bg-plum-deep'
                : card.tone === 'peach'
                  ? 'bg-peach hover:bg-peach/70'
                  : 'bg-lilac hover:bg-lilac/70'
            }`}
          >
            <h2
              className={`text-xl font-bold leading-tight ${
                card.tone === 'plum' ? 'text-white' : 'text-plum'
              }`}
            >
              {card.title}
            </h2>
            <p
              className={`mt-2 text-sm leading-relaxed ${
                card.tone === 'plum' ? 'text-white/80' : 'text-body'
              }`}
            >
              {card.body}
            </p>
            <span
              className={`mt-4 inline-block text-sm font-semibold ${
                card.tone === 'plum' ? 'text-orange' : 'text-plum'
              }`}
            >
              {card.cta} →
            </span>
          </button>
        ))}
      </div>

      <p className="mt-8 text-xs text-body/50">{t('home.builtBy')}</p>
    </div>
  )
}
