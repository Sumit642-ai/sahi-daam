/**
 * Onboarding (spec v2, 7.2): language → shop setup → how to start.
 *
 * Every step is a real route, so browser back and in-app back behave the
 * same, and every answer is saved the moment it is chosen (spec 8.2: back
 * keeps answers). `?next=product|upload|sample` carries the landing button's
 * choice through, skipping step 3.
 *
 * Once the shop is set up and has its first product, onboarding is over: its
 * steps replace themselves with /home, so Back from that first product (and
 * any Back after it) lands on home, never on a setup step again.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'

import { categoryNames as categories } from '../../data/categoryNames'
import { type BuyerRegion, rates } from '../../data/rates'
import { pct } from '../../engine/format'
import { useI18n, useT } from '../../i18n'
import { type Lang, type Shop, db } from '../db'
import { useBack, useShop } from '../hooks'
import { newShop, saveShop } from '../repo'
import { getKv, track } from '../telemetry'
import { BackButton, Button, Card, Choice, LoadingPage, StickyActions, buttonClass } from '../ui'

function useNext(): { next: string | null; suffix: string } {
  const [params] = useSearchParams()
  const next = params.get('next')
  const valid = next === 'product' || next === 'upload' || next === 'sample' ? next : null
  return { next: valid, suffix: valid ? `?next=${valid}` : '' }
}

/** True once onboarding is finished and the first product exists. */
function useOnboardingOver(): boolean {
  return useLiveQuery(async () => Boolean((await db.shop.get('main'))?.onboardedAt) && (await db.products.count()) > 0, []) ?? false
}

function StepHeader({ step, onBack }: { step: 1 | 2 | 3; onBack: () => void }) {
  const t = useT()
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <BackButton onClick={onBack} />
      <span className="text-sm font-medium text-muted">{t('onb.step', { n: step })}</span>
    </div>
  )
}

export function OnbLanguage() {
  const { t, setLang, lang } = useI18n()
  const navigate = useNavigate()
  const back = useBack('/')
  const { suffix } = useNext()
  const over = useOnboardingOver()

  if (over) return <Navigate to="/home" replace />

  const choose = async (l: Lang) => {
    setLang(l)
    await saveShop({ language: l })
    navigate(`/start/shop${suffix}`)
  }

  return (
    <div className="mx-auto max-w-xl">
      <StepHeader step={1} onBack={back} />
      <h1 className="text-2xl font-bold text-ink md:text-3xl">{t('onb.lang.title')}</h1>
      <p className="mt-2 text-base text-body/80">{t('onb.lang.hint')}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {(
          [
            ['en', 'English'],
            ['hi', 'हिंदी'],
          ] as const
        ).map(([code, label]) => (
          <button
            key={code}
            type="button"
            lang={code}
            aria-pressed={lang === code}
            onClick={() => void choose(code)}
            className={`min-h-[4.5rem] rounded-card border-2 px-5 text-left text-xl font-semibold ${
              lang === code ? 'border-plum bg-lilac text-plum' : 'border-plum/15 text-ink hover:bg-lilac/50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

type ShopAnswers = Pick<Shop, 'category' | 'gstRegistered' | 'buyerRegion' | 'prepaidDiscount'>

/** The four shop-setup questions, shared by onboarding and Me. */
export function ShopFields({ value, onChange }: { value: ShopAnswers; onChange: (patch: Partial<ShopAnswers>) => void }) {
  const { t, pick } = useI18n()
  const yesNo = [
    { value: 'yes' as const, label: t('common.yes') },
    { value: 'no' as const, label: t('common.no') },
  ]
  return (
    <div className="flex flex-col gap-7">
      <Choice
        legend={t('onb.shop.category')}
        columns={2}
        value={value.category}
        onChange={(category) => onChange({ category })}
        options={categories.map((c) => ({ value: c.id, label: pick({ en: c.name_en, hi: c.name_hi }) }))}
      />
      <Choice
        legend={t('onb.shop.gst')}
        value={value.gstRegistered ? 'yes' : 'no'}
        onChange={(v) => onChange({ gstRegistered: v === 'yes' })}
        options={yesNo}
      />
      <Choice<BuyerRegion>
        legend={t('onb.shop.buyers')}
        columns={3}
        value={value.buyerRegion}
        onChange={(buyerRegion) => onChange({ buyerRegion })}
        options={(['big_cities', 'mixed', 'small_towns'] as const).map((r) => ({ value: r, label: t(`region.${r}`) }))}
      />
      <Choice
        legend={t('onb.shop.prepaid')}
        hint={t('onb.shop.prepaidHint')}
        value={value.prepaidDiscount ? 'yes' : 'no'}
        onChange={(v) => onChange({ prepaidDiscount: v === 'yes' })}
        options={yesNo}
      />
    </div>
  )
}

export function OnbShop() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const back = useBack('/start/language')
  const { next, suffix } = useNext()
  const shop = useShop()
  const over = useOnboardingOver()

  if (over) return <Navigate to="/home" replace />
  if (shop === undefined) return <LoadingPage />
  const current = shop ?? newShop(lang)

  const finish = async () => {
    await saveShop({ onboardedAt: current.onboardedAt ?? Date.now() })
    void track('onboarding_done')
    const ref = await getKv<string>('referredBy')
    if (ref) void track('referral_signup', { ref })
    navigate(
      next === 'product' ? '/products/new' : next === 'upload' ? '/upload' : next === 'sample' ? '/upload?sample=1' : `/start/choose${suffix}`,
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <StepHeader step={2} onBack={back} />
      <h1 className="text-2xl font-bold text-ink md:text-3xl">{t('onb.shop.title')}</h1>
      <p className="mt-2 text-base text-body/80">{t('onb.shop.hint')}</p>
      <div className="mt-6">
        <ShopFields value={current} onChange={(patch) => void saveShop(patch)} />
        {current.category === 'other' && current.gstRegistered ? (
          // "Other" has no typical GST rate: the seller picks theirs.
          <div className="mt-7">
            <Choice<string>
              legend={t('onb.shop.gstRateOther')}
              hint={t('me.gstRateHint')}
              columns={3}
              value={current.gstRate === null ? '' : String(current.gstRate)}
              onChange={(v) => void saveShop({ gstRate: Number(v) })}
              options={rates.outputGstChoices.map((r) => ({ value: String(r), label: pct(r, 0) }))}
            />
          </div>
        ) : null}
      </div>
      <p className="mt-6 text-sm text-muted">{t('onb.shop.reportNote')}</p>
      <StickyActions>
        <Button className="w-full md:w-auto" onClick={() => void finish()}>
          {t('common.next')}
        </Button>
      </StickyActions>
    </div>
  )
}

export function OnbChoose() {
  const t = useT()
  const back = useBack('/start/shop')
  const over = useOnboardingOver()
  if (over) return <Navigate to="/home" replace />
  const options = [
    { to: '/upload', title: t('onb.choose.upload'), hint: t('onb.choose.uploadHint'), primary: true },
    { to: '/products/new', title: t('onb.choose.manual'), hint: t('onb.choose.manualHint'), primary: false },
  ]
  return (
    <div className="mx-auto max-w-xl">
      <StepHeader step={3} onBack={back} />
      <h1 className="text-2xl font-bold text-ink md:text-3xl">{t('onb.choose.title')}</h1>
      <div className="mt-6 flex flex-col gap-3">
        {options.map((o) => (
          <Link key={o.to} to={o.to} className="block rounded-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange">
            <Card tone={o.primary ? 'lilac' : 'white'} className="hover:border-plum">
              <span className="block text-lg font-semibold text-plum">{o.title}</span>
              <span className="mt-1 block text-base text-body/80">{o.hint}</span>
            </Card>
          </Link>
        ))}
        <Link to="/home" className={buttonClass('ghost', 'self-start')}>
          {t('onb.choose.skip')}
        </Link>
      </div>
    </div>
  )
}
