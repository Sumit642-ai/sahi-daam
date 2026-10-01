import { useMemo, useState } from 'react'

import {
  type BuyerMix,
  type SellerProfile,
  codShareFor,
  emptyProfile,
  useAuth,
} from '../auth'
import { categories, getCategory } from '../data'
import { defaultFloorInput, floorRange } from '../engine/floor'
import { inr, pct } from '../engine/format'
import { useI18n } from '../i18n'
import { Card, CardTitle } from '../components/Card'
import { NumberField, SelectField } from '../components/Field'
import { SourceTag } from '../components/SourceTag'

/**
 * The questions a seller answers once, so the rest of the app stops guessing.
 *
 * Every question here maps onto a field that Screen 1 currently labels "Meesho
 * ne bhara". After this, that tag is telling the truth: those values come from
 * this seller's own answers rather than from a category default someone picked.
 *
 * The floor preview updates as they answer, so the value of answering is
 * visible before they have finished.
 */
const BUYER_MIXES: BuyerMix[] = ['metro', 'mixed', 'small_town']

export function SellerOnboarding() {
  const { t, lang } = useI18n()
  const { account, saveProfile, platform } = useAuth()

  const [draft, setDraft] = useState<SellerProfile>(
    () => account?.profile ?? emptyProfile(),
  )

  const set = <K extends keyof SellerProfile>(key: K, value: SellerProfile[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const category = getCategory(draft.categoryId)
  const codShare = codShareFor(draft)

  // The same engine the rest of the app uses — no preview-only maths.
  const preview = useMemo(() => {
    const base = defaultFloorInput(draft.categoryId)
    return floorRange({
      ...base,
      cogs: draft.typicalCogs || 0,
      weightG: draft.typicalWeightG || 0,
      codShare,
      rtoCod: platform.rtoCod,
      rtoPrepaid: platform.rtoPrepaid,
      fees: { codFee: platform.codFee, gstRate: platform.gstRate },
    })
  }, [draft.categoryId, draft.typicalCogs, draft.typicalWeightG, codShare, platform])

  const ready = draft.sellerName.trim().length > 0 && (draft.typicalCogs ?? 0) > 0

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-plum sm:text-4xl">
        {t('onboard.title')}
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-body">{t('onboard.lead')}</p>

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        {/* ------------------------------------------------------ questions */}
        <div className="space-y-4">
          <Card tone="lilac">
            <CardTitle tone="lilac" hint={t('onboard.aboutYouHint')}>
              {t('onboard.aboutYou')}
            </CardTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 flex items-center gap-2 text-xs font-medium text-plum-deep">
                  {t('onboard.qName')}
                  <SourceTag provider="seller" />
                </span>
                <input
                  value={draft.sellerName}
                  onChange={(e) => set('sellerName', e.target.value)}
                  placeholder="Ramesh"
                  className="w-full rounded-lg bg-white px-3 py-2 text-sm font-semibold text-plum-deep outline-none focus:ring-2 focus:ring-plum/40"
                />
                <span className="mt-1 block text-[11px] text-body/60">{t('onboard.qNameHint')}</span>
              </label>
              <label className="block">
                <span className="mb-1 flex items-center gap-2 text-xs font-medium text-plum-deep">
                  {t('onboard.qShop')}
                  <SourceTag provider="seller" />
                </span>
                <input
                  value={draft.shopName}
                  onChange={(e) => set('shopName', e.target.value)}
                  placeholder="Ramesh Textiles"
                  className="w-full rounded-lg bg-white px-3 py-2 text-sm font-semibold text-plum-deep outline-none focus:ring-2 focus:ring-plum/40"
                />
              </label>
            </div>
          </Card>

          <Card tone="peach">
            <CardTitle tone="peach" hint={t('onboard.aboutProductHint')}>
              {t('onboard.aboutProduct')}
            </CardTitle>
            <div className="space-y-3">
              <SelectField
                label={t('onboard.qCategory')}
                provider="seller"
                value={draft.categoryId}
                onChange={(id) => {
                  const next = getCategory(id)
                  setDraft((d) => ({
                    ...d,
                    categoryId: id,
                    typicalCogs: next.exampleCogs,
                    typicalWeightG: next.defaultWeightG,
                  }))
                }}
                options={categories.map((c) => ({
                  value: c.id,
                  label: lang === 'hi' ? c.name_hi : c.name_en,
                }))}
                hint={t('onboard.qCategoryHint')}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField
                  label={t('onboard.qCogs')}
                  provider="seller"
                  value={draft.typicalCogs}
                  onChange={(v) => set('typicalCogs', v ?? 0)}
                  min={0}
                  step={5}
                  prefix="₹"
                  hint={t('onboard.qCogsHint')}
                />
                <NumberField
                  label={t('onboard.qWeight')}
                  provider="seller"
                  value={draft.typicalWeightG}
                  onChange={(v) => set('typicalWeightG', v ?? 0)}
                  min={0}
                  step={50}
                  suffix="g"
                  hint={t('onboard.qWeightHint')}
                />
              </div>
            </div>
          </Card>

          <Card tone="lilac">
            <CardTitle tone="lilac" hint={t('onboard.aboutBuyersHint')}>
              {t('onboard.aboutBuyers')}
            </CardTitle>

            <span className="mb-1 flex items-center gap-2 text-xs font-medium text-plum-deep">
              {t('onboard.qBuyers')}
              <SourceTag provider="seller" />
            </span>
            <div className="grid gap-2 sm:grid-cols-3">
              {BUYER_MIXES.map((mix) => (
                <button
                  key={mix}
                  type="button"
                  onClick={() => set('buyerMix', mix)}
                  aria-pressed={draft.buyerMix === mix}
                  className={`rounded-card p-3 text-left transition-colors ${
                    draft.buyerMix === mix ? 'bg-plum text-white' : 'bg-white hover:bg-white/70'
                  }`}
                >
                  <span className="block text-xs font-semibold">{t(`onboard.mix.${mix}`)}</span>
                  <span
                    className={`mt-0.5 block text-[11px] ${
                      draft.buyerMix === mix ? 'text-white/70' : 'text-body/60'
                    }`}
                  >
                    {t(`onboard.mix.${mix}.sub`)}
                  </span>
                </button>
              ))}
            </div>

            <label className="mt-3 flex items-start gap-3 rounded-lg bg-white/70 px-3 py-2.5">
              <input
                type="checkbox"
                checked={draft.prepaidDiscount}
                onChange={(e) => set('prepaidDiscount', e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-orange"
              />
              <span>
                <span className="block text-xs font-medium text-plum-deep">
                  {t('onboard.qPrepaid')}
                </span>
                <span className="block text-[11px] text-body/60">{t('onboard.qPrepaidHint')}</span>
              </span>
            </label>

            <div className="mt-3">
              <NumberField
                label={t('onboard.qOrders')}
                provider="seller"
                value={draft.ordersPerWeek}
                onChange={(v) => set('ordersPerWeek', v ?? 0)}
                min={0}
                step={10}
                hint={t('onboard.qOrdersHint')}
              />
            </div>
          </Card>
        </div>

        {/* -------------------------------------------------- live preview */}
        <div className="space-y-4 lg:sticky lg:top-4">
          <Card tone="plum">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
              {t('onboard.previewTitle')}
            </p>
            <p className="mt-2 text-4xl font-bold leading-none tracking-tight text-orange">
              {inr(preview.low)} <span className="text-white/40">–</span> {inr(preview.high)}
            </p>
            <p className="mt-1 text-sm text-white/80">
              {t('label.mostLikely')}{' '}
              <span className="font-bold text-white">{inr(preview.expected)}</span>
            </p>
            <p className="mt-3 text-[11px] leading-snug text-white/70">
              {t('onboard.previewNote')}
            </p>
          </Card>

          <Card tone="white">
            <CardTitle hint={t('onboard.filledHint')}>{t('onboard.filled')}</CardTitle>
            <dl className="space-y-1.5">
              {[
                [t('label.category'), lang === 'hi' ? category.name_hi : category.name_en],
                [t('label.codShare'), pct(codShare, 0)],
                [t('label.expectedRto'), pct(preview.results.expected.rto)],
                [
                  t('label.returnRate'),
                  `${pct(category.returnRateLow, 0)} – ${pct(category.returnRateHigh, 0)}`,
                ],
                [t('label.shippingSlab'), preview.results.expected.slab.label],
                [t('label.packaging'), inr(category.packagingCost)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between gap-3 rounded-lg bg-lilac/60 px-3 py-2"
                >
                  <dt className="flex items-center gap-2 text-[11px] text-body">
                    {label}
                    <SourceTag provider="meesho" />
                  </dt>
                  <dd className="text-xs font-semibold tabular-nums text-plum-deep">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <button
            type="button"
            disabled={!ready}
            onClick={() => saveProfile(draft)}
            className="w-full rounded-lg bg-plum px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-plum-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            {ready ? t('onboard.finish') : t('onboard.finishDisabled')}
          </button>
        </div>
      </div>
    </div>
  )
}
