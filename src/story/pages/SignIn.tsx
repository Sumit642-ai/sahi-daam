import { useState } from 'react'

import { type Role, useAuth } from '../auth'
import { useI18n, type TranslationKey } from '../i18n'
import { Card } from '../components/Card'

/**
 * Sign in / sign up.
 *
 * Not authentication — see the warning at the top of `auth.tsx`. The banner on
 * this page says the same thing to whoever is using it, because a login box
 * that looks real and is not is the one thing here that could actually mislead
 * someone.
 */
export function SignIn() {
  const { t } = useI18n()
  const { signIn, signUp, enterDemo } = useAuth()

  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [role, setRole] = useState<Role>('seller')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<TranslationKey | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const result = mode === 'in' ? signIn(email, password) : signUp(email, password, role)
    if (!result.ok) setError(result.error as TranslationKey)
    else setError(null)
  }

  const field =
    'w-full rounded-lg bg-white px-3 py-2.5 text-sm font-medium text-plum-deep outline-none ' +
    'ring-0 transition-shadow placeholder:font-normal placeholder:text-body/40 ' +
    'focus:ring-2 focus:ring-plum/40'

  return (
    <div className="mx-auto grid max-w-5xl items-center gap-6 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:py-16">
      {/* -------------------------------------------------------- the pitch */}
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-plum sm:text-5xl">Sahi Daam</h1>
        <p className="mt-2 max-w-lg text-base leading-relaxed text-body">{t('auth.pitch')}</p>

        <div className="mt-5 rounded-card bg-lilac p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-body/70">
            {t('auth.whyAsk')}
          </p>
          <ul className="mt-2 space-y-1.5">
            {(
              [
                'auth.why1',
                'auth.why2',
                'auth.why3',
              ] as const
            ).map((key) => (
              <li key={key} className="flex gap-2 text-sm text-body">
                <span aria-hidden="true" className="text-orange">
                  ·
                </span>
                {t(key)}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* --------------------------------------------------------- the form */}
      {/* First on a phone too: the demo button is the first thing anyone sees. */}
      <Card tone="peach" className="order-first lg:order-none">
        {/* The demo is the main way in: one tap, no form. */}
        <button
          type="button"
          onClick={enterDemo}
          className="w-full rounded-lg bg-orange px-4 py-3.5 text-base font-bold text-white transition-opacity hover:opacity-90"
        >
          {t('auth.demoSeller')} →
        </button>
        <p className="mt-1.5 text-center text-[11px] text-body/70">{t('auth.demoSellerSub')}</p>

        <p className="mt-4 text-center text-[11px] font-semibold uppercase tracking-wide text-plum/70">
          {t('auth.orSignIn')}
        </p>

        <div className="mt-2 flex gap-1 rounded-lg bg-white/70 p-1">
          {(['in', 'up'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m)
                setError(null)
              }}
              aria-pressed={mode === m}
              className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                mode === m ? 'bg-plum text-white' : 'text-plum'
              }`}
            >
              {m === 'in' ? t('auth.signIn') : t('auth.signUp')}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3">
          {mode === 'up' ? (
            <div>
              <span className="mb-1 block text-xs font-medium text-plum-deep">
                {t('auth.iAm')}
              </span>
              <div className="grid grid-cols-2 gap-2">
                {(['seller', 'admin'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    aria-pressed={role === r}
                    className={`rounded-lg px-3 py-2.5 text-left transition-colors ${
                      role === r ? 'bg-plum text-white' : 'bg-white text-plum'
                    }`}
                  >
                    <span className="block text-xs font-semibold">
                      {r === 'seller' ? t('auth.roleSeller') : t('auth.roleAdmin')}
                    </span>
                    <span
                      className={`block text-[10px] ${role === r ? 'text-white/70' : 'text-body/60'}`}
                    >
                      {r === 'seller' ? t('auth.roleSellerSub') : t('auth.roleAdminSub')}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-plum-deep">
              {t('auth.email')}
            </span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ramesh@demo.in"
              className={field}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-plum-deep">
              {t('auth.password')}
            </span>
            <input
              type="password"
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={field}
            />
          </label>

          {error ? (
            <p className="rounded-lg bg-magenta/10 px-3 py-2 text-xs font-medium text-magenta">
              {t(error)}
            </p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-lg bg-plum px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-plum-deep"
          >
            {mode === 'in' ? t('auth.signIn') : t('auth.createAccount')}
          </button>
        </form>

        <p className="mt-3 rounded-lg bg-magenta/10 px-3 py-2 text-[11px] leading-snug text-body">
          <span className="font-bold text-magenta">{t('auth.warningTitle')}</span>{' '}
          {t('auth.warningBody')}
        </p>
      </Card>
    </div>
  )
}
