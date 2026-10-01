import type { ReactNode } from 'react'

import { useAuth } from '../auth'
import { useI18n } from '../i18n'

/**
 * Global top bar (spec section 9): the name, the EN/हिं toggle, the Judge mode
 * switch, and the screen tabs.
 *
 * The tabs scroll horizontally rather than wrapping — six screens wrapped onto
 * three rows on a phone and pushed the actual content off the first screenful.
 */
interface TopBarProps {
  onHome: () => void
  tabs?: ReactNode
}

export function TopBar({ onHome, tabs }: TopBarProps) {
  const { t, lang, setLang, judge, setJudge } = useI18n()
  const { account, signOut } = useAuth()

  return (
    <header className="bg-plum">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <button type="button" onClick={onHome} className="flex items-baseline gap-2 text-left">
          <span className="text-lg font-bold tracking-tight text-white">Sahi Daam</span>
          <span className="text-xs text-white/60">{t('app.tagline')}</span>
        </button>

        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 rounded-full bg-white/10 p-0.5">
            {(['en', 'hi'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                aria-label={l === 'en' ? 'English' : 'हिंदी'}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  lang === l ? 'bg-white text-plum' : 'text-white/80 hover:text-white'
                }`}
              >
                {l === 'en' ? 'EN' : 'हिं'}
              </button>
            ))}
          </div>

          <BarToggle
            checked={judge}
            onChange={setJudge}
            label={t('app.judge')}
            hint={t('app.judgeHint')}
          />

          {account ? (
            <button
              type="button"
              onClick={signOut}
              title={account.email}
              className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
            >
              <span
                aria-hidden="true"
                className="flex h-5 w-5 items-center justify-center rounded-full bg-orange text-[10px] font-bold text-white"
              >
                {(account.profile?.sellerName || account.email)[0]!.toUpperCase()}
              </span>
              <span className="hidden whitespace-nowrap sm:inline">
                {account.profile?.sellerName || (account.role === 'admin' ? t('auth.roleAdmin') : '')}
              </span>
              <span className="whitespace-nowrap text-white/60">{t('auth.signOut')}</span>
            </button>
          ) : null}
        </div>
      </div>

      {tabs ? (
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <nav className="flex gap-1.5 overflow-x-auto pb-2">{tabs}</nav>
        </div>
      ) : null}
    </header>
  )
}

interface TabProps {
  active: boolean
  onClick: () => void
  label: string
  sub: string
}

export function BarTab({ active, onClick, label, sub }: TabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`shrink-0 rounded-t-lg px-3 py-2 text-left transition-colors ${
        active ? 'bg-white' : 'bg-white/10 hover:bg-white/20'
      }`}
    >
      <span
        className={`block whitespace-nowrap text-xs font-semibold ${
          active ? 'text-plum' : 'text-white'
        }`}
      >
        {label}
      </span>
      <span
        className={`block whitespace-nowrap text-[10px] ${active ? 'text-body/60' : 'text-white/60'}`}
      >
        {sub}
      </span>
    </button>
  )
}

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  hint?: string
}

/** A switch styled for the plum bar. */
export function BarToggle({ checked, onChange, label, hint }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      title={hint}
      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        checked ? 'bg-orange text-white' : 'bg-white/10 text-white hover:bg-white/20'
      }`}
    >
      <span
        aria-hidden="true"
        className={`relative h-4 w-7 rounded-full transition-colors ${
          checked ? 'bg-white/40' : 'bg-white/30'
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${
            checked ? 'left-3.5' : 'left-0.5'
          }`}
        />
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  )
}
