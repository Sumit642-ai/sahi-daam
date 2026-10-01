import type { ReactNode } from 'react'

/**
 * The one card shape used everywhere. Design system (spec section 3): rounded
 * fills, no drop shadows, no borders, no decorative stripes — separation comes
 * from the fill colour and from spacing alone.
 */
export type CardTone = 'white' | 'lilac' | 'peach' | 'plum'

const TONE: Record<CardTone, string> = {
  white: 'bg-white text-body',
  lilac: 'bg-lilac text-body',
  peach: 'bg-peach text-body',
  plum: 'bg-plum text-white',
}

interface CardProps {
  tone?: CardTone
  className?: string
  children: ReactNode
}

export function Card({ tone = 'white', className = '', children }: CardProps) {
  return (
    <section className={`rounded-card p-4 sm:p-5 ${TONE[tone]} ${className}`}>{children}</section>
  )
}

interface CardTitleProps {
  children: ReactNode
  tone?: CardTone
  /** Small line under the title, e.g. who fills these fields in. */
  hint?: ReactNode
  /** Rendered on the right of the title row. */
  aside?: ReactNode
}

export function CardTitle({ children, tone = 'white', hint, aside }: CardTitleProps) {
  const titleColor = tone === 'plum' ? 'text-white' : 'text-plum'
  const hintColor = tone === 'plum' ? 'text-white/70' : 'text-body/70'
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className={`text-sm font-semibold uppercase tracking-wide ${titleColor}`}>{children}</h2>
        {hint ? <p className={`mt-0.5 text-xs ${hintColor}`}>{hint}</p> : null}
      </div>
      {aside}
    </div>
  )
}
