import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from 'react'

import { useI18n } from '../i18n'

/**
 * The ⓘ "Show working" disclosure (spec section 9): every output number can be
 * expanded to show its formula and the exact numbers that produced it.
 *
 * Seller mode keeps these collapsed; the page-level "Show all workings" switch
 * opens every one at once, which is what Judge mode will drive in Phase 6.
 *
 * `ShowWorking` is the all-in-one control. `InfoButton` + `WorkingPanel` are the
 * same thing taken apart, for places like the cost table where the button and
 * the panel cannot be siblings in the DOM.
 */

export const ExpandAllContext = createContext(false)

export interface WorkingStep {
  /** What this step is, e.g. "Total overhead on 100 dispatched". */
  label: string
  /** The arithmetic, e.g. "₹5,000 + ₹4,032 + …". */
  formula?: string
  /** The result, e.g. "₹12,437". */
  value?: string
  /** Where the numbers come from, or a caveat. */
  note?: string
  /** Renders the step as the panel's conclusion. */
  emphasis?: boolean
}

/** Open state that follows the page-level switch but stays toggleable after it. */
export function useWorkingDisclosure(): [boolean, () => void, string] {
  const expandAll = useContext(ExpandAllContext)
  const [open, setOpen] = useState(expandAll)
  const panelId = useId()
  useEffect(() => setOpen(expandAll), [expandAll])
  return [open, () => setOpen((v) => !v), panelId]
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-[15px] w-[15px] shrink-0">
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7.1v4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="4.5" r="0.95" fill="currentColor" />
    </svg>
  )
}

interface InfoButtonProps {
  open: boolean
  onToggle: () => void
  panelId: string
  /** Names the number being explained, for the screen-reader label. */
  title: string
  onDark?: boolean
  withLabel?: boolean
  className?: string
}

export function InfoButton({
  open,
  onToggle,
  panelId,
  title,
  onDark = false,
  withLabel = false,
  className = '',
}: InfoButtonProps) {
  const { t } = useI18n()
  const tone = onDark ? 'text-white/70 hover:text-white' : 'text-plum/60 hover:text-plum'
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={panelId}
      className={`inline-flex items-center gap-1 rounded-full align-middle text-[11px] font-medium transition-colors ${tone} ${className}`}
    >
      <InfoIcon />
      <span className={withLabel ? '' : 'sr-only'}>
        {open ? t('working.hide') : t('working.show')}
        <span className="sr-only"> — {title}</span>
      </span>
    </button>
  )
}

interface WorkingPanelProps {
  id: string
  title: string
  steps: WorkingStep[]
  source?: string
  footer?: ReactNode
  className?: string
}

export function WorkingPanel({
  id,
  title,
  steps,
  source,
  footer,
  className = '',
}: WorkingPanelProps) {
  const { t } = useI18n()
  return (
    <div id={id} className={`rounded-card bg-white/95 p-3 text-left ${className}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-plum">
        {t('working.howIs', { name: title.toLowerCase() })}
      </p>
      <dl className="mt-2 space-y-1.5">
        {steps.map((step, i) => (
          <div
            key={`${step.label}-${i}`}
            className={`rounded-lg px-2 py-1.5 ${step.emphasis ? 'bg-peach' : 'bg-lilac/70'}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <dt
                className={`text-xs ${
                  step.emphasis ? 'font-semibold text-plum-deep' : 'text-body'
                }`}
              >
                {step.label}
              </dt>
              {step.value ? (
                <dd
                  className={`text-xs tabular-nums ${
                    step.emphasis ? 'font-bold text-plum-deep' : 'font-semibold text-body'
                  }`}
                >
                  {step.value}
                </dd>
              ) : null}
            </div>
            {step.formula ? (
              <p className="mt-0.5 break-words font-mono text-[11px] leading-snug text-body/80">
                {step.formula}
              </p>
            ) : null}
            {step.note ? (
              <p className="mt-0.5 text-[11px] leading-snug text-body/60">{step.note}</p>
            ) : null}
          </div>
        ))}
      </dl>
      {footer ? <div className="mt-2 text-[11px] leading-snug text-body/80">{footer}</div> : null}
      {source ? (
        <p className="mt-2 text-[10px] uppercase tracking-wide text-body/50">
          {t('working.source')}: {source}
        </p>
      ) : null}
    </div>
  )
}

interface ShowWorkingProps {
  title: string
  steps: WorkingStep[]
  source?: string
  footer?: ReactNode
  onDark?: boolean
  withLabel?: boolean
  className?: string
}

export function ShowWorking({
  title,
  steps,
  source,
  footer,
  onDark = false,
  withLabel = false,
  className = '',
}: ShowWorkingProps) {
  const [open, toggle, panelId] = useWorkingDisclosure()
  return (
    <div className={className}>
      <InfoButton
        open={open}
        onToggle={toggle}
        panelId={panelId}
        title={title}
        onDark={onDark}
        withLabel={withLabel}
      />
      {open ? (
        <WorkingPanel
          id={panelId}
          title={title}
          steps={steps}
          source={source}
          footer={footer}
          className="mt-2"
        />
      ) : null}
    </div>
  )
}
