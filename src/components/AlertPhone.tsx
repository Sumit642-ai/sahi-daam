import type { ReactNode } from 'react'

import { inr } from '../engine/format'
import {
  CHECK_BUTTON,
  SEVERITY_LABEL_BY_LANG,
  TRIGGER_TITLE_BY_LANG,
  WEEK_LABEL,
  type Lang,
  nudgeFor,
} from '../engine/nudges'
import type { Alert, Severity } from '../engine/triggers'
import { ShowWorking } from './ShowWorking'

/**
 * Screen 4's phone mock-up and its chat bubbles (spec section 9.5).
 *
 * The chat metaphor is WhatsApp's, because that is where a Meesho seller
 * actually reads their notifications. The styling is deliberately Sahi Daam's
 * own palette rather than WhatsApp's green: this is a mock-up of a message the
 * seller would receive from us, not a pretend WhatsApp.
 */

interface PhoneFrameProps {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}

export function PhoneFrame({ title, subtitle, children, footer }: PhoneFrameProps) {
  return (
    <div className="mx-auto w-full max-w-[22rem] rounded-[2rem] bg-plum-deep p-2.5">
      <div className="overflow-hidden rounded-[1.6rem] bg-lilac">
        <div className="flex items-center gap-3 bg-plum px-3 py-2.5">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange text-sm font-bold text-white"
          >
            ₹
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white">{title}</span>
            <span className="block truncate text-[10px] text-white/60">{subtitle}</span>
          </span>
        </div>

        <div className="h-[30rem] space-y-2.5 overflow-y-auto px-3 py-3">{children}</div>

        {footer ? <div className="bg-white/60 px-3 py-2">{footer}</div> : null}
      </div>
    </div>
  )
}

const SEVERITY_DOT: Record<Severity, string> = {
  info: 'bg-plum',
  warn: 'bg-orange',
  critical: 'bg-magenta',
}

interface AlertBubbleProps {
  alert: Alert
  lang: Lang
  /** The signed-in seller's name, so the message is addressed to them. */
  sellerName?: string
  /** Deep-links to Screen 2 with this alert's numbers loaded. */
  onCheckPrice: (alert: Alert) => void
  /** A stable clock time, so the feed reads like a real conversation. */
  time: string
}

export function AlertBubble({ alert, lang, onCheckPrice, time, sellerName }: AlertBubbleProps) {
  const { body } = nudgeFor(alert, lang, sellerName ? { name: sellerName } : {})

  return (
    <div className="max-w-[17rem] rounded-2xl rounded-tl-sm bg-white px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[alert.severity]}`}
        />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-plum">
          {alert.id} · {TRIGGER_TITLE_BY_LANG[lang][alert.id]}
        </span>
      </div>

      <p className="text-[12px] leading-snug text-body">{body}</p>

      <button
        type="button"
        onClick={() => onCheckPrice(alert)}
        className="mt-2.5 w-full rounded-lg bg-plum px-3 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-plum-deep"
      >
        {CHECK_BUTTON[lang]} →
      </button>

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-[9px] text-body/40">
          {WEEK_LABEL[lang]} {alert.week} · {SEVERITY_LABEL_BY_LANG[lang][alert.severity]}
        </span>
        <span className="text-[9px] text-body/40">{time}</span>
      </div>

      <ShowWorking
        className="mt-1"
        title={`alert ${alert.id}`}
        steps={[
          { label: 'Why it fired', note: alert.detail },
          { label: 'What to do', note: alert.action },
          ...Object.entries(alert.numbers).map(([key, value]) => ({
            label: key,
            value:
              typeof value === 'number' && /floor|price|loss|profit|cogs|suggested/i.test(key)
                ? inr(value)
                : String(value),
          })),
        ]}
        source="Spec section 6.6 — trigger rules; section 8 — message templates"
      />
    </div>
  )
}
