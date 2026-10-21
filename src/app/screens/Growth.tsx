/**
 * Share with a seller friend (spec v2, 7.10) and the Pro waitlist (section
 * 10): a fake-door test, labelled honestly as "coming soon".
 */
import { useEffect, useId, useState } from 'react'

import { useI18n } from '../../i18n'
import { backendConfig, enqueue, getKv, referralCode, shareUrl, track, whatsappLink } from '../telemetry'
import { Button, Card, buttonClass } from '../ui'

export function ShareCard() {
  const { t } = useI18n()
  // Created on first use; a write, so not inside a live query.
  const [code, setCode] = useState<string | null>(null)
  useEffect(() => {
    void referralCode().then(setCode)
  }, [])
  if (!code) return null
  const link = shareUrl(window.location.origin, code)
  return (
    <Card tone="lilac" className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-ink">{t('share.title')}</h2>
      <p className="text-base text-body">{t('share.body')}</p>
      <p className="text-sm text-muted">{t('share.code', { code })}</p>
      <a
        href={whatsappLink(t('share.message', { link }))}
        target="_blank"
        rel="noreferrer"
        onClick={() => void track('share_clicked', { kind: 'REFERRAL' })}
        className={buttonClass('primary', 'self-start')}
      >
        {t('share.cta')}
      </a>
    </Card>
  )
}

const PHONE = /^(\+?91[\s-]?)?[6-9]\d{9}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function validContact(raw: string): boolean {
  const v = raw.trim().replace(/[\s-]/g, '')
  return PHONE.test(v) || EMAIL.test(raw.trim())
}

export function ProWaitlistCard() {
  const { t, lang } = useI18n()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [contact, setContact] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async () => {
    if (!validContact(contact) || !consent) {
      setError(true)
      return
    }
    // Team devices (?team=1) are tagged so /stats leaves their test sign-ups out.
    await enqueue('waitlist', { contact: contact.trim(), consent: true, lang, team: (await getKv<boolean>('team')) === true })
    void track('pro_waitlist_joined')
    setDone(true)
  }

  return (
    <Card className="flex flex-col gap-2 border-2 border-dashed border-plum/30">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-ink">{t('pro.title')}</h2>
        <span className="rounded-full bg-peach px-2 py-0.5 text-xs font-semibold text-thin">{t('pro.soon')}</span>
      </div>
      <p className="text-base text-body">{t('pro.body')}</p>
      {done ? (
        <p role="status" className="text-base font-semibold text-healthy">
          {backendConfig() ? t('pro.thanks') : t('pro.thanksLocal')}
        </p>
      ) : open ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <label htmlFor={`${id}-c`} className="text-base font-medium text-ink">
            {t('pro.contact')}
          </label>
          <input
            id={`${id}-c`}
            value={contact}
            autoComplete="tel"
            onChange={(e) => {
              setContact(e.target.value)
              setError(false)
            }}
            className="min-h-tap w-full min-w-0 rounded-xl border-2 border-plum/20 px-3 text-base focus:outline-none focus:ring-2 focus:ring-orange"
          />
          <label className="flex min-h-tap items-start gap-3 text-base text-body">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-plum" />
            {t('pro.consent')}
          </label>
          {error ? <p className="text-sm font-medium text-loss">{t('pro.error')}</p> : null}
          <button type="submit" className={buttonClass('primary', 'self-start')}>
            {t('pro.submit')}
          </button>
        </form>
      ) : (
        <Button variant="secondary" className="self-start" onClick={() => setOpen(true)}>
          {t('pro.cta')}
        </Button>
      )}
    </Card>
  )
}
