import type { Verdict } from '../engine/recommend'
import { useI18n } from '../i18n'

/**
 * The four verdicts of spec section 6.2. Losses are magenta, healthy is the
 * profit green, and NOT_VIABLE is the loudest thing on the screen because it
 * is the one the seller cannot price their way out of.
 */
const STYLE: Record<Verdict, string> = {
  NOT_VIABLE: 'bg-magenta text-white',
  LOSS: 'bg-magenta/15 text-magenta',
  THIN: 'bg-orange/20 text-[#8A4408]',
  HEALTHY: 'bg-profit/15 text-profit',
}

interface VerdictBadgeProps {
  verdict: Verdict
  size?: 'sm' | 'lg'
  className?: string
}

export function VerdictBadge({ verdict, size = 'sm', className = '' }: VerdictBadgeProps) {
  const { t } = useI18n()
  const dims = size === 'lg' ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-[11px]'
  return (
    <span
      className={`inline-block shrink-0 rounded-full font-bold ${dims} ${STYLE[verdict]} ${className}`}
    >
      {t(`verdict.${verdict}`)}
    </span>
  )
}
