import { useEffect, useId, useState, type ReactNode } from 'react'

import { SourceTag, type Provider } from './SourceTag'

/**
 * Form controls for Screen 1. Every one carries a provenance tag (spec section
 * 9), and none of them use a border — the design system forbids it, so the
 * affordance is a filled background plus a focus ring.
 */

const INPUT =
  'w-full rounded-lg bg-white px-3 py-2 text-sm font-semibold text-plum-deep tabular-nums ' +
  'outline-none ring-0 transition-shadow placeholder:font-normal placeholder:text-body/40 ' +
  'focus:ring-2 focus:ring-plum/40'

interface LabelRowProps {
  htmlFor?: string
  label: string
  provider: Provider
  /** The ⓘ panel, or any trailing content on the label row. */
  aside?: ReactNode
}

function LabelRow({ htmlFor, label, provider, aside }: LabelRowProps) {
  return (
    <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-plum-deep">
        {label}
      </label>
      <SourceTag provider={provider} />
      {aside}
    </div>
  )
}

// ------------------------------------------------------------------ number field

interface NumberFieldProps {
  label: string
  provider: Provider
  value: number | null
  onChange: (value: number | null) => void
  min?: number
  max?: number
  step?: number
  /** Rendered inside the control, e.g. "₹". */
  prefix?: string
  /** Rendered inside the control, e.g. "g" or "%". */
  suffix?: string
  placeholder?: string
  hint?: ReactNode
  aside?: ReactNode
}

/**
 * Holds its own text so a half-typed or cleared value does not get coerced to 0
 * mid-keystroke; emits `null` when empty and snaps back to canonical on blur.
 */
export function NumberField({
  label,
  provider,
  value,
  onChange,
  min,
  max,
  step,
  prefix,
  suffix,
  placeholder,
  hint,
  aside,
}: NumberFieldProps) {
  const id = useId()
  const [text, setText] = useState(value === null ? '' : String(value))

  useEffect(() => {
    setText((current) => {
      const parsed = current.trim() === '' ? null : Number(current)
      return parsed === value ? current : value === null ? '' : String(value)
    })
  }, [value])

  const commit = (raw: string) => {
    setText(raw)
    const trimmed = raw.trim()
    if (trimmed === '') {
      onChange(null)
      return
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) return
    let next = parsed
    if (min !== undefined) next = Math.max(min, next)
    if (max !== undefined) next = Math.min(max, next)
    onChange(next)
  }

  return (
    <div>
      <LabelRow htmlFor={id} label={label} provider={provider} aside={aside} />
      <div className="relative">
        {prefix ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-body/50">
            {prefix}
          </span>
        ) : null}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={text}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => setText(value === null ? '' : String(value))}
          className={`${INPUT} ${prefix ? 'pl-7' : ''} ${suffix ? 'pr-9' : ''}`}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-body/50">
            {suffix}
          </span>
        ) : null}
      </div>
      {hint ? <p className="mt-1 text-[11px] leading-snug text-body/60">{hint}</p> : null}
    </div>
  )
}

// ------------------------------------------------------------------ select field

interface SelectFieldProps<T extends string> {
  label: string
  provider: Provider
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  hint?: ReactNode
  aside?: ReactNode
}

export function SelectField<T extends string>({
  label,
  provider,
  value,
  onChange,
  options,
  hint,
  aside,
}: SelectFieldProps<T>) {
  const id = useId()
  return (
    <div>
      <LabelRow htmlFor={id} label={label} provider={provider} aside={aside} />
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={`${INPUT} appearance-none pr-8`}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%235B1A46'><path d='M4 6l4 4 4-4z'/></svg>\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 0.6rem center',
          backgroundSize: '1rem',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <p className="mt-1 text-[11px] leading-snug text-body/60">{hint}</p> : null}
    </div>
  )
}

// ------------------------------------------------------------------ slider field

interface SliderFieldProps {
  label: string
  provider: Provider
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step: number
  /** The current value, already formatted, shown beside the label. */
  display: string
  /** Small captions under the two ends of the track. */
  ends?: [string, string]
  hint?: ReactNode
}

export function SliderField({
  label,
  provider,
  value,
  onChange,
  min,
  max,
  step,
  display,
  ends,
  hint,
}: SliderFieldProps) {
  const id = useId()
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <label htmlFor={id} className="text-xs font-medium text-plum-deep">
            {label}
          </label>
          <SourceTag provider={provider} />
        </div>
        <span className="text-sm font-bold tabular-nums text-orange">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-5 w-full cursor-pointer accent-orange"
      />
      {ends ? (
        <div className="flex justify-between text-[10px] text-body/50">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      ) : null}
      {hint ? <p className="mt-1 text-[11px] leading-snug text-body/60">{hint}</p> : null}
    </div>
  )
}

// --------------------------------------------------------------- read-only value

interface ReadOnlyFieldProps {
  label: string
  provider: Provider
  value: string
  /** Second line, e.g. what the value becomes after the season index. */
  detail?: ReactNode
  aside?: ReactNode
}

/**
 * An auto-filled value the seller sees but does not edit here — the Advanced
 * drawer holds the editable version.
 */
export function ReadOnlyField({ label, provider, value, detail, aside }: ReadOnlyFieldProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded-lg bg-white/70 px-3 py-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs font-medium text-plum-deep">{label}</span>
          <SourceTag provider={provider} />
        </div>
        {detail ? <div className="mt-0.5 text-[11px] leading-snug text-body/60">{detail}</div> : null}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-semibold tabular-nums text-plum-deep">{value}</span>
        {aside}
      </div>
    </div>
  )
}
