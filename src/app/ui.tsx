/**
 * Shared building blocks for the MVP screens (spec v2, section 13): a calm
 * calculator. Rounded cards, no shadows, 48 px tap targets, rem everywhere,
 * status always icon + word + colour.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import type { InputSource } from '../engine/keep'
import { useT } from '../i18n'
import type { Status } from './lib/products'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-plum text-white hover:bg-plum-deep disabled:bg-plum/40',
  secondary: 'border-2 border-plum text-plum bg-white hover:bg-lilac disabled:opacity-50',
  ghost: 'text-plum hover:bg-lilac disabled:opacity-50',
  danger: 'border-2 border-loss text-loss bg-white hover:bg-loss/5',
}

const BUTTON_BASE =
  'inline-flex min-h-tap items-center justify-center gap-2 rounded-xl px-5 py-2 text-center text-base font-semibold ' +
  'transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-orange disabled:cursor-not-allowed'

export function buttonClass(variant: Variant = 'primary', extra = ''): string {
  return `${BUTTON_BASE} ${VARIANT[variant]} ${extra}`
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" {...props} className={buttonClass(variant, className)} />
}

export function ButtonLink({
  to,
  variant = 'primary',
  className = '',
  children,
}: {
  to: string
  variant?: Variant
  className?: string
  children: ReactNode
}) {
  return (
    <Link to={to} className={buttonClass(variant, className)}>
      {children}
    </Link>
  )
}

export function Card({ children, tone = 'white', className = '' }: { children: ReactNode; tone?: 'white' | 'lilac' | 'peach'; className?: string }) {
  const bg = tone === 'lilac' ? 'bg-lilac' : tone === 'peach' ? 'bg-peach' : 'bg-white border border-plum/15'
  return <div className={`rounded-card p-4 md:p-5 ${bg} ${className}`}>{children}</div>
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl font-bold text-ink md:text-3xl">{children}</h1>
}

const STATUS_STYLE: Record<Status, { icon: string; cls: string }> = {
  LOSS: { icon: '✕', cls: 'bg-loss/10 text-loss' },
  THIN: { icon: '!', cls: 'bg-thin/10 text-thin' },
  HEALTHY: { icon: '✓', cls: 'bg-healthy/10 text-healthy' },
}

export function StatusBadge({ status }: { status: Status }) {
  const t = useT()
  const s = STATUS_STYLE[status]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-sm font-semibold ${s.cls}`}>
      <span aria-hidden="true">{s.icon}</span>
      {t(`status.${status}`)}
    </span>
  )
}

export const STATUS_TEXT: Record<Status, string> = {
  LOSS: 'text-loss',
  THIN: 'text-thin',
  HEALTHY: 'text-healthy',
}

/** "From your report" / "You entered" / "Estimated" (hard rule 7). */
export function SourceChip({ source, title }: { source: InputSource; title?: string }) {
  const t = useT()
  const cls =
    source === 'FROM_REPORT'
      ? 'bg-healthy/10 text-healthy'
      : source === 'YOU_ENTERED'
        ? 'bg-plum/10 text-plum'
        : 'bg-peach text-thin'
  return (
    <span title={title} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {t(`source.${source}`)}
    </span>
  )
}

/** A labelled text input with help text, an inline error, and an optional chip. */
export function TextField({
  label,
  value,
  onChange,
  onBlur,
  error,
  help,
  chip,
  placeholder,
  inputMode,
  type = 'text',
  autoFocus,
  optional,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  error?: string
  help?: ReactNode
  chip?: ReactNode
  placeholder?: string
  inputMode?: 'text' | 'decimal' | 'numeric'
  type?: 'text' | 'date'
  autoFocus?: boolean
  optional?: boolean
}) {
  const t = useT()
  const id = useId()
  const helpId = `${id}-help`
  const errorId = `${id}-error`
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <label htmlFor={id} className="text-base font-medium text-ink">
          {label}
          {optional ? <span className="ml-1 text-sm font-normal text-muted">({t('common.optional')})</span> : null}
        </label>
        {chip}
      </div>
      <input
        id={id}
        type={type}
        value={value}
        inputMode={inputMode}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={[help ? helpId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined}
        className={`min-h-tap w-full min-w-0 rounded-xl border-2 bg-white px-3 text-base text-ink placeholder:text-body/40 focus:outline-none focus:ring-2 focus:ring-orange ${
          error ? 'border-loss' : 'border-plum/20'
        }`}
      />
      {help ? (
        <p id={helpId} className="text-sm text-muted">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-loss">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** Big tap-target radio group (onboarding answers, filters). */
export function Choice<T extends string>({
  legend,
  hint,
  options,
  value,
  onChange,
  columns = 2,
}: {
  legend: string
  hint?: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  columns?: 1 | 2 | 3 | 4
}) {
  const name = useId()
  const cols = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-3', 4: 'grid-cols-2 md:grid-cols-4' }[columns]
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-lg font-semibold text-ink">{legend}</legend>
      {hint ? <p className="-mt-1 mb-1 text-sm text-muted">{hint}</p> : null}
      <div className={`grid gap-2 ${cols}`}>
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex min-h-tap cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2 text-base has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-orange ${
              value === o.value ? 'border-plum bg-lilac font-semibold text-plum' : 'border-plum/15 bg-white text-ink'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="h-5 w-5 shrink-0 accent-plum"
            />
            <span className="min-w-0 break-words">{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** A modal confirm (Discard changes?). Focus starts on the safe choice. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-sm rounded-card bg-white p-5">
        <h2 id={titleId} className="text-xl font-bold text-ink">
          {title}
        </h2>
        <p className="mt-2 text-base text-body">{body}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <button ref={cancelRef} type="button" onClick={onCancel} className={buttonClass('primary')}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/** A back button for screen headers. */
export function BackButton({ onClick }: { onClick: () => void }) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-2 inline-flex min-h-tap min-w-tap items-center gap-1 rounded-xl px-2 text-base font-medium text-plum hover:bg-lilac"
    >
      <span aria-hidden="true">←</span>
      {t('common.back')}
    </button>
  )
}

/**
 * The primary action bar on forms: sticky to the bottom of the screen on a
 * phone (above the home indicator), inline on a laptop.
 */
export function StickyActions({ children }: { children: ReactNode }) {
  return (
    <div className="pb-safe sticky bottom-0 z-10 -mx-4 mt-6 border-t border-plum/10 bg-white/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:backdrop-blur-none">
      {children}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-card bg-lilac ${className}`} />
}

export function LoadingPage() {
  const t = useT()
  return (
    // Full screen height, so nothing below it moves when the content arrives (no layout shift).
    <div className="flex min-h-dvh flex-col gap-3" aria-busy="true">
      <span className="sr-only">{t('common.loading')}</span>
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-28" />
      <Skeleton className="h-20" />
      <Skeleton className="h-20" />
    </div>
  )
}
