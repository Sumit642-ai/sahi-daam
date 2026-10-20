/**
 * Concept: how Sahi Daam could work inside a marketplace seller panel
 * (spec v2, 7.12 and section 12). A generic panel frame in neutral greys and
 * blues: no marketplace logo, colours or name. The existing "recommended
 * price range" idea, with the floor line drawn across it and "you keep ₹X";
 * every input marked auto-filled except product cost, the one field the
 * seller fills. Example numbers, labelled as such.
 */
import { useState } from 'react'

import { inr } from '../../engine/format'
import { DEFAULT_SHOP, defaultKeepInput, keepPerSale } from '../../engine/keep'
import { type MessageKey, useT } from '../../i18n'
import { parseAmount } from '../lib/validate'

/** Example market band for the concept (labelled "example numbers" on screen). */
const BAND = { low: 260, high: 380 }
const AXIS = { min: 200, max: 440 }
const PRICE = 300

const INPUTS: { key: string; auto: boolean }[] = [
  { key: 'price', auto: true },
  { key: 'weight', auto: true },
  { key: 'shipping', auto: true },
  { key: 'rto', auto: true },
  { key: 'returns', auto: true },
  { key: 'ads', auto: true },
  { key: 'market', auto: true },
  { key: 'cost', auto: false },
]

export function Concept() {
  const t = useT()
  const [costText, setCostText] = useState('150')
  const parsed = parseAmount(costText)
  const cost = parsed !== null && !Number.isNaN(parsed) && parsed > 0 ? parsed : 150
  const result = keepPerSale(defaultKeepInput('ethnic_women', { cost, price: PRICE, weightG: 350 }, DEFAULT_SHOP))
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - AXIS.min) / (AXIS.max - AXIS.min)) * 100))}%`
  const keeps = result.keep >= 0

  return (
    <div className="mx-auto flex max-w-content flex-col gap-5">
      <p className="rounded-card bg-slate-100 px-4 py-3 text-base font-semibold text-slate-700">{t('concept.label')}</p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        {/* A generic panel frame: neutral, unbranded. */}
        <section className="overflow-hidden rounded-card border border-slate-300 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-800 px-4 py-3 text-white">
            <span aria-hidden="true" className="h-3 w-3 rounded-full bg-slate-500" />
            <span className="text-base font-semibold">{t('concept.panelTitle')}</span>
          </div>
          <div className="flex flex-col gap-4 p-4 md:p-6">
            <p className="text-base font-semibold text-slate-800">{t('concept.listing')}</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('concept.field.price')} value={inr(PRICE)} auto />
              <Field label={t('concept.field.weight')} value="350 g" auto />
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-sm font-semibold text-slate-800">{t('concept.costLabel')}</span>
                <input
                  inputMode="decimal"
                  value={costText}
                  onChange={(e) => setCostText(e.target.value)}
                  className="min-h-tap w-full min-w-0 rounded-lg border-2 border-blue-600 bg-white px-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </label>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-700">{t('concept.rangeTitle')}</p>
              <p className="text-sm text-slate-600">{t('concept.marketRange', { low: inr(BAND.low), high: inr(BAND.high) })}</p>
              <div className="relative mt-8 h-10" aria-hidden="true">
                <div className="absolute inset-x-0 top-4 h-2 rounded-full bg-slate-200" />
                <div className="absolute top-4 h-2 rounded-full bg-blue-300" style={{ left: pos(BAND.low), width: `calc(${pos(BAND.high)} - ${pos(BAND.low)})` }} />
                <div className="absolute -top-6 bottom-0 w-0.5 bg-red-600" style={{ left: pos(result.floor) }}>
                  <span className="absolute -top-1 left-1 whitespace-nowrap text-xs font-semibold text-red-700">{t('concept.floorLine', { floor: inr(result.floor) })}</span>
                </div>
                <div className="absolute top-2 h-6 w-6 -translate-x-1/2 rounded-full border-4 border-white bg-slate-900" style={{ left: pos(PRICE) }} />
              </div>
              <p className="sr-only">{t('concept.floorLine', { floor: inr(result.floor) })}</p>
              <p className={`mt-3 text-xl font-bold ${keeps ? 'text-green-700' : 'text-red-700'}`}>
                {keeps ? t('concept.keep', { price: inr(PRICE), keep: inr(result.keep) }) : t('concept.lose', { price: inr(PRICE), loss: inr(-result.keep) })}
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Field label={t('concept.field.shipping')} value="₹59" auto />
              <Field label={t('concept.field.rto')} value="17%" auto />
              <Field label={t('concept.field.returns')} value="15.7%" auto />
              <Field label={t('concept.field.ads')} value="₹0" auto />
            </div>
            <p className="text-sm text-slate-500">{t('concept.example')}</p>
          </div>
        </section>

        <aside className="rounded-card border border-slate-300 bg-slate-50 p-4 md:p-5">
          <h2 className="text-lg font-semibold text-slate-800">{t('concept.inputsTitle')}</h2>
          <dl className="mt-3 flex flex-col gap-3">
            {INPUTS.map(({ key, auto }) => (
              <div key={key}>
                <dt className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-800">
                  {t(`concept.input.${key}` as MessageKey)}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${auto ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-900'}`}>
                    {auto ? t('concept.auto') : t('concept.sellerInput')}
                  </span>
                </dt>
                <dd className="text-sm text-slate-600">{t(`concept.source.${key}` as MessageKey)}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </div>
  )
}

function Field({ label, value, auto }: { label: string; value: string; auto: boolean }) {
  const t = useT()
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <span className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        {label}
        {auto ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">{t('concept.auto')}</span> : null}
      </span>
      <span className="text-base font-semibold text-slate-900">{value}</span>
    </div>
  )
}
