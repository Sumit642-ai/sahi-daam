import { Suspense, lazy, useState } from 'react'

import { AuthProvider, DEMO_SELLER_ID, useAuth } from './auth'
import { ExpandAllContext } from './components/ShowWorking'
import { BarTab, TopBar } from './components/TopBar'
import { I18nProvider, useI18n } from './i18n'
import { AdminConsole } from './pages/AdminConsole'
import { Alerts } from './pages/Alerts'
import { Assumptions } from './pages/Assumptions'
import { FloorCalculator } from './pages/FloorCalculator'
import { Home } from './pages/Home'
import { MarketBand } from './pages/MarketBand'
import { MeeshoComparison } from './pages/MeeshoComparison'
import { SellerOnboarding } from './pages/SellerOnboarding'
import { SignIn } from './pages/SignIn'
import { ProductInputsProvider } from './state/productInputs'

/**
 * Three gates, then the app.
 *
 *   not signed in            -> SignIn
 *   seller, no answers yet   -> SellerOnboarding
 *   signed in                -> Home and the six screens
 *
 * The onboarding gate is the one that earns its place: it is what turns the
 * "Meesho ne bhara" tag on Screen 1 from a label into a fact. An admin never
 * sees it — they set the platform-wide numbers instead.
 *
 * Judge mode is the single switch spec section 9 describes: it opens every ⓘ
 * formula panel by default (so it drives ExpandAllContext) and reveals the
 * simulator's hidden ε on the journey screen.
 *
 * Still no router — the screen is component state.
 */

/**
 * Screen 3 is the only thing that pulls in Recharts, which is about 60% of the
 * bundle. Splitting it out keeps the first paint — Home and the floor
 * calculator, where every demo starts — small.
 */
const SellerJourney = lazy(() =>
  import('./pages/SellerJourney').then((m) => ({ default: m.SellerJourney })),
)

type Screen =
  | 'home'
  | 'floor'
  | 'band'
  | 'journey'
  | 'alerts'
  | 'compare'
  | 'assumptions'
  | 'admin'
  | 'profile'

function Shell() {
  const { t, judge } = useI18n()
  const { account } = useAuth()
  const [screen, setScreen] = useState<Screen>('home')

  const isAdmin = account?.role === 'admin'

  const tabs: { id: Screen; label: string; sub: string }[] = [
    { id: 'floor', label: t('nav.floor'), sub: t('nav.floorSub') },
    { id: 'band', label: t('nav.band'), sub: t('nav.bandSub') },
    { id: 'journey', label: t('nav.journey'), sub: t('nav.journeySub') },
    { id: 'alerts', label: t('nav.alerts'), sub: t('nav.alertsSub') },
    { id: 'compare', label: t('nav.compare'), sub: t('nav.compareSub') },
    { id: 'assumptions', label: t('nav.assumptions'), sub: t('nav.assumptionsSub') },
    ...(isAdmin
      ? [{ id: 'admin' as const, label: t('nav.admin'), sub: t('nav.adminSub') }]
      : [{ id: 'profile' as const, label: t('nav.profile'), sub: t('nav.profileSub') }]),
  ]

  return (
    <ExpandAllContext.Provider value={judge}>
      <div className="min-h-screen bg-white">
        <TopBar
          onHome={() => setScreen('home')}
          tabs={
            <>
              <BarTab
                active={screen === 'home'}
                onClick={() => setScreen('home')}
                label={t('nav.home')}
                sub={t('nav.homeSub')}
              />
              {tabs.map((tab) => (
                <BarTab
                  key={tab.id}
                  active={screen === tab.id}
                  onClick={() => setScreen(tab.id)}
                  label={tab.label}
                  sub={tab.sub}
                />
              ))}
            </>
          }
        />

        {screen === 'home' ? (
          <Home
            onOpenFloor={() => setScreen('floor')}
            onOpenJourney={() => setScreen('journey')}
            onOpenCompare={() => setScreen('compare')}
          />
        ) : screen === 'floor' ? (
          <FloorCalculator />
        ) : screen === 'band' ? (
          <MarketBand />
        ) : screen === 'journey' ? (
          <Suspense
            fallback={
              <p className="mx-auto max-w-6xl px-4 py-10 text-sm text-body/60 sm:px-6">
                {t('journey.loading')}
              </p>
            }
          >
            <SellerJourney judgeMode={judge} />
          </Suspense>
        ) : screen === 'compare' ? (
          <MeeshoComparison onOpenBand={() => setScreen('band')} />
        ) : screen === 'assumptions' ? (
          <Assumptions />
        ) : screen === 'admin' ? (
          <AdminConsole onOpenAssumptions={() => setScreen('assumptions')} />
        ) : screen === 'profile' ? (
          <SellerOnboarding />
        ) : (
          <Alerts onOpenBand={() => setScreen('band')} />
        )}
      </div>
    </ExpandAllContext.Provider>
  )
}

/** What the demo seller was going to list his ₹150 kurti at. */
const DEMO_PLANNED_PRICE = 300

/** The gates, and the product state that depends on which one you are past. */
function Gated() {
  const { account, platform } = useAuth()

  if (!account) return <SignIn />

  if (account.role === 'seller' && !account.profile?.completed) {
    return <SellerOnboarding />
  }

  return (
    // Keyed on the account so switching seller rebuilds the product from that
    // seller's own answers rather than carrying the last one's numbers over.
    <ProductInputsProvider
      key={account.id}
      profile={account.profile}
      platform={platform}
      // Ramesh's own price — cost × 2 — so the demo opens on the ₹18 loss.
      initial={account.id === DEMO_SELLER_ID ? { plannedPrice: DEMO_PLANNED_PRICE } : undefined}
    >
      <Shell />
    </ProductInputsProvider>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <Gated />
      </AuthProvider>
    </I18nProvider>
  )
}
