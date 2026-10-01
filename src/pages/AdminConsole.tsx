import { useState } from 'react'

import {
  PLATFORM_FALLBACK,
  type PlatformDefaults,
  codShareFor,
  useAuth,
} from '../auth'
import { getCategory } from '../data'
import { defaultFloorInput, floorRange } from '../engine/floor'
import { inr, pct } from '../engine/format'
import { useI18n } from '../i18n'
import { Card, CardTitle } from '../components/Card'
import { NumberField } from '../components/Field'

/**
 * The admin side — Meesho's own view.
 *
 * This is what makes the "Meesho ne bhara" tag on Screen 1 honest. Those values
 * are not invented by the prototype: they are set here, once, for every seller
 * on the platform. Changing the COD handling fee moves every seller's floor,
 * and the table underneath shows by how much.
 *
 * Shipping slabs and the per-category return rates stay read-only — they are
 * larger datasets that belong in a real admin tool, and the Numbers & sources
 * screen already lists every one of them with its citation.
 */
export function AdminConsole({ onOpenAssumptions }: { onOpenAssumptions: () => void }) {
  const { t, lang } = useI18n()
  const { accounts, platform, savePlatform, resetEverything } = useAuth()

  const [draft, setDraft] = useState<PlatformDefaults>(platform)
  const dirty = (Object.keys(draft) as (keyof PlatformDefaults)[]).some(
    (k) => draft[k] !== platform[k],
  )

  const set = <K extends keyof PlatformDefaults>(key: K, value: PlatformDefaults[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const sellers = accounts.filter((a) => a.role === 'seller')

  /** What one seller's floor is, under the saved platform defaults vs the draft. */
  function floorFor(
    profile: NonNullable<(typeof sellers)[number]['profile']>,
    using: PlatformDefaults,
  ) {
    const base = defaultFloorInput(profile.categoryId)
    return floorRange({
      ...base,
      cogs: profile.typicalCogs,
      weightG: profile.typicalWeightG,
      codShare: codShareFor(profile),
      rtoCod: using.rtoCod,
      rtoPrepaid: using.rtoPrepaid,
      fees: { codFee: using.codFee, gstRate: using.gstRate },
    }).expected
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-plum sm:text-3xl">
          {t('admin.title')}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-body">{t('admin.lead')}</p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {/* --------------------------------------------- platform defaults */}
        <Card tone="peach">
          <CardTitle tone="peach" hint={t('admin.defaultsHint')}>
            {t('admin.defaults')}
          </CardTitle>

          <div className="space-y-3">
            <NumberField
              label={t('admin.codFee')}
              provider="meesho"
              value={draft.codFee}
              onChange={(v) => set('codFee', Math.max(0, v ?? 0))}
              min={0}
              step={1}
              prefix="₹"
              hint={t('admin.codFeeHint')}
            />
            <NumberField
              label={t('admin.gstRate')}
              provider="meesho"
              value={Math.round(draft.gstRate * 1000) / 10}
              onChange={(v) => set('gstRate', Math.max(0, Math.min(100, v ?? 0)) / 100)}
              min={0}
              max={100}
              step={0.5}
              suffix="%"
              hint={t('admin.gstRateHint')}
            />
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label={t('admin.rtoCod')}
                provider="meesho"
                value={Math.round(draft.rtoCod * 1000) / 10}
                onChange={(v) => set('rtoCod', Math.max(0, Math.min(100, v ?? 0)) / 100)}
                min={0}
                max={100}
                step={0.5}
                suffix="%"
              />
              <NumberField
                label={t('admin.rtoPrepaid')}
                provider="meesho"
                value={Math.round(draft.rtoPrepaid * 1000) / 10}
                onChange={(v) => set('rtoPrepaid', Math.max(0, Math.min(100, v ?? 0)) / 100)}
                min={0}
                max={100}
                step={0.5}
                suffix="%"
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!dirty}
              onClick={() => savePlatform(draft)}
              className="rounded-lg bg-plum px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-plum-deep disabled:opacity-40"
            >
              {dirty ? t('admin.apply') : t('admin.applied')}
            </button>
            <button
              type="button"
              onClick={() => setDraft(PLATFORM_FALLBACK)}
              className="rounded-lg bg-white px-3 py-2.5 text-xs font-semibold text-plum transition-colors hover:bg-white/70"
            >
              {t('admin.restore')}
            </button>
          </div>

          <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-[11px] leading-snug text-body/70">
            {t('admin.readOnlyNote')}{' '}
            <button
              type="button"
              onClick={onOpenAssumptions}
              className="font-semibold text-plum underline"
            >
              {t('nav.assumptions')} →
            </button>
          </p>
        </Card>

        {/* ------------------------------------------------- seller impact */}
        <div className="space-y-4">
          <Card tone="white">
            <CardTitle
              hint={t('admin.sellersHint', { n: sellers.length })}
              aside={
                dirty ? (
                  <span className="rounded-full bg-orange/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8A4408]">
                    {t('admin.preview')}
                  </span>
                ) : null
              }
            >
              {t('admin.sellers')}
            </CardTitle>

            {sellers.length === 0 ? (
              <p className="text-sm text-body/60">{t('admin.noSellers')}</p>
            ) : (
              <div className="-mx-2 overflow-x-auto">
                <table className="w-full table-auto">
                  <thead>
                    <tr>
                      {[
                        t('admin.colSeller'),
                        t('label.category'),
                        t('label.codShare'),
                        t('label.floor'),
                      ].map((h, i) => (
                        <th
                          key={h}
                          scope="col"
                          className={`px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-body/50 ${
                            i === 0 ? 'text-left' : 'text-right'
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sellers.map((seller, i) => {
                      const profile = seller.profile
                      const saved = profile ? floorFor(profile, platform) : null
                      const next = profile ? floorFor(profile, draft) : null
                      const moved = saved !== null && next !== null && Math.round(next) !== Math.round(saved)
                      return (
                        <tr key={seller.id} className={i % 2 === 1 ? 'bg-lilac/60' : ''}>
                          <th scope="row" className="px-2 py-2 text-left align-top text-xs font-normal">
                            <span className="block font-medium text-plum-deep">
                              {profile?.sellerName || seller.email}
                            </span>
                            <span className="block text-[10px] text-body/50">{seller.email}</span>
                          </th>
                          <td className="px-2 py-2 text-right align-top text-xs text-body">
                            {profile
                              ? lang === 'hi'
                                ? getCategory(profile.categoryId).name_hi
                                : getCategory(profile.categoryId).name_en
                              : '—'}
                          </td>
                          <td className="px-2 py-2 text-right align-top text-xs tabular-nums text-body">
                            {profile ? pct(codShareFor(profile), 0) : '—'}
                          </td>
                          <td className="px-2 py-2 text-right align-top text-xs font-semibold tabular-nums text-plum-deep">
                            {saved === null ? (
                              <span className="text-body/50">{t('admin.notOnboarded')}</span>
                            ) : moved ? (
                              <>
                                <span className="text-body/50 line-through">{inr(saved)}</span>{' '}
                                <span className="text-orange">{inr(next!)}</span>
                              </>
                            ) : (
                              inr(saved)
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="mt-3 text-[11px] leading-snug text-body/60">{t('admin.impactNote')}</p>
          </Card>

          <Card tone="lilac">
            <CardTitle tone="lilac" hint={t('admin.dangerHint')}>
              {t('admin.danger')}
            </CardTitle>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(t('admin.resetConfirm'))) resetEverything()
              }}
              className="rounded-lg bg-magenta/10 px-3 py-2 text-xs font-semibold text-magenta transition-colors hover:bg-magenta/20"
            >
              {t('admin.reset')}
            </button>
          </Card>
        </div>
      </div>
    </div>
  )
}
