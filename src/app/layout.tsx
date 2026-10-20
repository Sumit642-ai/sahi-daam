/**
 * Layout (MVP spec v2, section 13 as amended): mobile-first, fully responsive.
 *
 *   phone   < 768 px   one column, bottom nav, sticky form buttons
 *   tablet  768–1023   two columns where useful, bottom nav
 *   laptop  ≥ 1024 px  left sidebar, list–detail split, content ≤ 1200 px
 *
 * Same features everywhere; only the layout changes. A "phone frame" toggle
 * on laptops renders the app inside a phone-sized iframe for demos, so the
 * real phone breakpoints apply inside it.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  ScrollRestoration,
  useLocation,
  useMatches,
  useNavigate,
} from 'react-router-dom'

import { useI18n, useT } from '../i18n'
import { db } from './db'
import { useShop } from './hooks'
import { useActiveCheckCount, useAppSync } from './sync'
import { readLaunchParams } from './telemetry'
import { ToastProvider } from './toast'
import { LoadingPage, buttonClass } from './ui'

// ------------------------------------------------------------- phone frame

const FRAME_KEY = 'sahi-daam.phoneFrame'

function inIframe(): boolean {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false)
  const [matches, setMatches] = useState(get)
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}

function readFrame(): boolean {
  try {
    return localStorage.getItem(FRAME_KEY) === '1'
  } catch {
    return false
  }
}

function writeFrame(on: boolean) {
  try {
    localStorage.setItem(FRAME_KEY, on ? '1' : '0')
  } catch {
    // Per-device convenience only.
  }
}

/** Turns the phone frame on or off; provided by Root. */
const SetFrameContext = createContext<(on: boolean) => void>(() => {})

export function PhoneFrameToggle({ className = '' }: { className?: string }) {
  const t = useT()
  const setFrame = useContext(SetFrameContext)
  if (inIframe()) return null
  return (
    <button
      type="button"
      title={t('frame.hint')}
      onClick={() => setFrame(true)}
      className={`hidden min-h-tap items-center gap-2 rounded-xl px-3 text-sm font-medium text-plum hover:bg-lilac lg:inline-flex ${className}`}
    >
      <span aria-hidden="true">📱</span>
      {t('frame.on')}
    </button>
  )
}

function PhoneFrameView({ onExit }: { onExit: (path: string) => void }) {
  const t = useT()
  const location = useLocation()
  const ref = useRef<HTMLIFrameElement>(null)
  const src = `${location.pathname}${location.search}${location.hash}`
  const exit = () => {
    let path = src
    try {
      const l = ref.current?.contentWindow?.location
      if (l) path = `${l.pathname}${l.search}${l.hash}`
    } catch {
      // Same origin, so this should not throw; keep the outer path if it does.
    }
    onExit(path)
  }
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-lilac p-6">
      <div className="rounded-[40px] border-[12px] border-ink bg-ink">
        <iframe ref={ref} title="Sahi Daam" src={src} className="block h-[min(844px,85dvh)] w-[390px] rounded-[28px] bg-white" />
      </div>
      <button type="button" onClick={exit} className={buttonClass('secondary')}>
        {t('frame.exit')}
      </button>
    </div>
  )
}

// ------------------------------------------------------------- banners

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

/** Below this storage quota the browser is probably a private window (a heuristic; spec 8.3). */
const PRIVATE_QUOTA_BYTES = 120 * 1024 * 1024

function useTemporaryStorage(): boolean {
  const [temporary, setTemporary] = useState(false)
  useEffect(() => {
    const estimate = globalThis.navigator?.storage?.estimate
    if (typeof estimate !== 'function') return
    navigator.storage
      .estimate()
      .then((e) => setTemporary(typeof e.quota === 'number' && e.quota > 0 && e.quota < PRIVATE_QUOTA_BYTES))
      .catch(() => {})
  }, [])
  return temporary
}

// -------------------------------------------------------------------- root

export function Root() {
  const t = useT()
  const navigate = useNavigate()
  const isLaptop = useMediaQuery('(min-width: 1024px)')
  const [frame, setFrameState] = useState(readFrame)
  const [blocked, setBlocked] = useState(false)

  const setFrame = (on: boolean) => {
    writeFrame(on)
    setFrameState(on)
  }

  useEffect(() => {
    db.open().catch(() => setBlocked(true))
    // ?team=1 tags this device; ?ref=CODE remembers who shared the app (section 10, 7.10).
    void readLaunchParams(window.location.search)
  }, [])

  const online = useOnline()
  const temporary = useTemporaryStorage()

  if (frame && isLaptop && !inIframe()) {
    return (
      <PhoneFrameView
        onExit={(path) => {
          setFrame(false)
          navigate(path, { replace: true })
        }}
      />
    )
  }

  return (
    <SetFrameContext.Provider value={setFrame}>
      <ToastProvider>
        {blocked ? (
          <div role="alert" className="pt-safe bg-thin px-4 py-2 text-center text-base text-white">
            {t('storage.blocked')}
          </div>
        ) : null}
        {!online ? (
          <div role="status" className="pt-safe bg-ink px-4 py-2 text-center text-base text-white">
            {t('banner.offline')}
          </div>
        ) : null}
        {temporary && !blocked ? (
          <div role="status" className="bg-peach px-4 py-2 text-center text-sm text-thin">
            {t('banner.private')}
          </div>
        ) : null}
        <Outlet />
        <ScrollRestoration />
      </ToastProvider>
    </SetFrameContext.Provider>
  )
}

// ---------------------------------------------------------------- shared

export function LanguageToggle({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { lang, setLang, t } = useI18n()
  return (
    <div role="group" aria-label={t('me.language')} className={`flex rounded-full p-1 ${tone === 'dark' ? 'bg-white/10' : 'bg-lilac'}`}>
      {(['en', 'hi'] as const).map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={`min-h-tap min-w-tap rounded-full px-3 text-sm font-semibold ${
            lang === l
              ? tone === 'dark'
                ? 'bg-white text-plum'
                : 'bg-plum text-white'
              : tone === 'dark'
                ? 'text-white/80'
                : 'text-plum'
          }`}
        >
          {l === 'en' ? 'EN' : 'हिं'}
        </button>
      ))}
    </div>
  )
}

function Brand({ stacked = false }: { stacked?: boolean }) {
  const t = useT()
  return (
    <span className={`flex min-w-0 ${stacked ? 'flex-col' : 'items-baseline gap-2'}`}>
      <span className="whitespace-nowrap text-xl font-bold tracking-tight text-plum">Sahi Daam</span>
      {/* The tagline gives way on narrow phones rather than wrapping the name. */}
      <span className={`truncate text-sm text-muted ${stacked ? '' : 'hidden sm:inline'}`}>{t('app.tagline')}</span>
    </span>
  )
}

export function Footer({ className = '' }: { className?: string }) {
  const t = useT()
  return (
    <footer className={`border-t border-plum/10 px-4 py-5 text-sm text-muted ${className}`}>
      <div className="mx-auto flex max-w-content flex-wrap items-center gap-x-4 gap-y-2">
        <span>{t('footer.independent')}</span>
        <Link to="/privacy" className="inline-flex min-h-tap items-center underline underline-offset-2">
          {t('footer.privacy')}
        </Link>
        <Link to="/how-it-works" className="inline-flex min-h-tap items-center underline underline-offset-2">
          {t('footer.howItWorks')}
        </Link>
      </div>
    </footer>
  )
}

function SkipLink() {
  const t = useT()
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-orange focus:px-4 focus:py-3 focus:text-white"
    >
      {t('app.skip')}
    </a>
  )
}

/** Landing, onboarding and privacy: a header, one column, the footer. */
export function MinimalLayout() {
  return (
    <div className="pl-safe pr-safe flex min-h-dvh flex-col">
      <SkipLink />
      <header className="pt-safe border-b border-plum/10">
        <div className="mx-auto flex max-w-content items-center justify-between gap-3 px-4 py-2 md:px-6">
          <Link to="/" className="flex min-h-tap min-w-0 items-center">
            <Brand />
          </Link>
          <LanguageToggle />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-content flex-1 px-4 py-6 md:px-6 md:py-10">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

/** Sends anyone who hasn't finished shop setup to onboarding. */
export function RequireOnboarded({ children }: { children: ReactNode }) {
  const shop = useShop()
  if (shop === undefined) {
    return (
      <div className="mx-auto max-w-content p-4">
        <LoadingPage />
      </div>
    )
  }
  if (!shop?.onboardedAt) return <Navigate to="/start/language" replace />
  return <>{children}</>
}

// --------------------------------------------------------------- app shell

type NavId = 'home' | 'products' | 'checks' | 'me'

const NAV: { id: NavId; to: string }[] = [
  { id: 'home', to: '/home' },
  { id: 'products', to: '/products' },
  { id: 'checks', to: '/checks' },
  { id: 'me', to: '/me' },
]

function CheckBadge({ id }: { id: NavId }) {
  const n = useActiveCheckCount()
  if (id !== 'checks' || n === 0) return null
  return (
    <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-magenta px-1.5 text-xs font-bold text-white" aria-label={`(${n})`}>
      {n}
    </span>
  )
}

function NavIcon({ id }: { id: NavId }) {
  const common = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  switch (id) {
    case 'home':
      return (
        <svg {...common}>
          <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
        </svg>
      )
    case 'products':
      return (
        <svg {...common}>
          <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
          <path d="m3 8 9 5 9-5M12 13v8" />
        </svg>
      )
    case 'checks':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12 3 3 5-6" />
        </svg>
      )
    case 'me':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      )
  }
}

interface RouteHandle {
  /** Forms and focused flows hide the bottom nav on phones. */
  hideNav?: boolean
}

function Sidebar() {
  const t = useT()
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-2 border-r border-plum/10 bg-white px-4 py-5 lg:flex">
      <Link to="/home" className="mb-4 flex min-h-tap items-center px-2">
        <Brand stacked />
      </Link>
      <nav aria-label={t('nav.main')} className="flex flex-col gap-1">
        {NAV.map((n) => (
          <NavLink
            key={n.id}
            to={n.to}
            className={({ isActive }) =>
              `flex min-h-tap items-center gap-3 rounded-xl px-3 text-base font-medium ${
                isActive ? 'bg-lilac text-plum' : 'text-ink hover:bg-lilac/60'
              }`
            }
          >
            <NavIcon id={n.id} />
            {t(`nav.${n.id}`)}
            <CheckBadge id={n.id} />
          </NavLink>
        ))}
      </nav>
      <div className="mt-4 flex flex-col gap-2">
        <Link to="/products/new" className={buttonClass('primary')}>
          {t('nav.addProduct')}
        </Link>
        <Link to="/upload" className={buttonClass('secondary')}>
          {t('nav.upload')}
        </Link>
      </div>
      <div className="mt-auto flex flex-col items-start gap-2">
        <LanguageToggle />
        <PhoneFrameToggle />
      </div>
    </aside>
  )
}

function BottomNav() {
  const t = useT()
  return (
    <nav
      aria-label={t('nav.main')}
      className="pb-safe pl-safe pr-safe fixed inset-x-0 bottom-0 z-40 border-t border-plum/10 bg-white lg:hidden"
    >
      <ul className="mx-auto flex h-nav max-w-content">
        {NAV.map((n) => (
          <li key={n.id} className="flex-1">
            <NavLink
              to={n.to}
              className={({ isActive }) =>
                `flex h-full min-h-tap flex-col items-center justify-center gap-0.5 text-sm font-medium ${
                  isActive ? 'text-plum' : 'text-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`rounded-full px-4 py-0.5 ${isActive ? 'bg-lilac' : ''}`}>
                    <NavIcon id={n.id} />
                  </span>
                  <span className="flex items-center">
                    {t(`nav.${n.id}`)}
                    <CheckBadge id={n.id} />
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Home, Products, Checks, Me: sidebar on laptops, bottom nav below. */
export function AppLayout() {
  useAppSync()
  const matches = useMatches()
  const hideNav = matches.some((m) => (m.handle as RouteHandle | undefined)?.hideNav)
  return (
    <div className="pl-safe pr-safe min-h-dvh lg:flex">
      <SkipLink />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="pt-safe border-b border-plum/10 lg:hidden">
          <div className="mx-auto flex max-w-content items-center justify-between gap-3 px-4 py-2 md:px-6">
            <Link to="/home" className="flex min-h-tap min-w-0 items-center">
              <Brand />
            </Link>
            <LanguageToggle />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-content flex-1 px-4 py-5 md:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
        <Footer className={hideNav ? 'pb-safe' : 'pb-nav lg:pb-5'} />
      </div>
      {hideNav ? null : <BottomNav />}
    </div>
  )
}
