/**
 * Add / edit a product by hand (spec v2, 7.4): four required fields, the rest
 * folded under "More details". Every blank optional field shows the estimate
 * we'll use instead, with an "Estimated" chip saying where it comes from.
 *
 * Leaving with unsaved changes asks "Discard changes?" (spec 8.2), whether
 * through the Back button, the browser's back, or a nav link.
 */
import { useMemo, useRef, useState } from 'react'
import { useBlocker, useNavigate, useParams } from 'react-router-dom'

import { categoryNames as categories } from '../../data/categoryNames'
import { categoryRates, rates } from '../../data/rates'
import { shippingFor } from '../../engine/keep'
import { inr } from '../../engine/format'
import { useI18n } from '../../i18n'
import type { Product, Shop } from '../db'
import { useBack, useProduct, useShop } from '../hooks'
import { type DraftField, type ProductDraft, draftFromProduct, emptyDraft, parseAmount, validateProduct, WEIGHT_MAX_G, WEIGHT_MIN_G } from '../lib/validate'
import { addProduct, updateProduct } from '../repo'
import { track } from '../telemetry'
import { useToast } from '../toast'
import { BackButton, Card, ConfirmDialog, LoadingPage, PageTitle, SourceChip, StickyActions, TextField, buttonClass } from '../ui'

export function ProductForm() {
  const { id } = useParams()
  const shop = useShop()
  const product = useProduct(id)
  const { t } = useI18n()

  if (shop === undefined || (id !== undefined && product === undefined)) return <LoadingPage />
  if (id !== undefined && product === null) {
    return (
      <Card>
        <p className="text-base">{t('detail.notFound')}</p>
      </Card>
    )
  }
  return <ProductFormInner key={id ?? 'new'} shop={shop!} product={product ?? null} />
}

const OPTIONAL_FIELDS: DraftField[] = ['sku', 'ship', 'returnShip', 'packaging', 'adPerOrder', 'ordersPerWeek', 'stock', 'listedSince']

function ProductFormInner({ shop, product }: { shop: Shop; product: Product | null }) {
  const { t, pick } = useI18n()
  const navigate = useNavigate()
  const toast = useToast()
  const back = useBack(product ? `/products/${product.id}` : '/home')

  const initial = useMemo<ProductDraft>(
    () => (product ? draftFromProduct(product) : emptyDraft(shop.category)),
    [product, shop.category],
  )
  const [draft, setDraft] = useState<ProductDraft>(initial)
  const [touched, setTouched] = useState<Partial<Record<DraftField, boolean>>>({})
  const [moreOpen, setMoreOpen] = useState(() => OPTIONAL_FIELDS.some((f) => initial[f] !== ''))
  const [saving, setSaving] = useState(false)
  const saved = useRef(false)

  const validation = validateProduct(draft)
  const dirty = (Object.keys(draft) as DraftField[]).some((k) => draft[k] !== initial[k])

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !saved.current && currentLocation.pathname !== nextLocation.pathname,
  )

  const set = (field: DraftField) => (value: string) => setDraft((d) => ({ ...d, [field]: value }))
  const touch = (field: DraftField) => () => setTouched((s) => ({ ...s, [field]: true }))
  const errorFor = (field: DraftField) => {
    const key = validation.errors[field]
    if (!key) return undefined
    // Required-field errors wait for the field to be left; format errors show as you type.
    if (!touched[field] && (draft[field] === '' || key === 'error.weightRange')) return undefined
    return t(key)
  }

  const save = async () => {
    if (!validation.value || saving) return
    setSaving(true)
    saved.current = true
    try {
      if (product) {
        await updateProduct(product.id, validation.value)
        toast({ message: t('product.saved') })
        back()
      } else {
        const created = await addProduct({ ...validation.value, priceSetAt: Date.now() })
        void track('product_added', { products: 1 })
        toast({ message: t('product.saved') })
        navigate(`/products/${created.id}`, { replace: true })
      }
    } catch {
      saved.current = false
      setSaving(false)
    }
  }

  // The estimates a blank optional field falls back to.
  const weight = parseAmount(draft.weightG)
  const weightForEstimate =
    weight !== null && weight >= WEIGHT_MIN_G && weight <= WEIGHT_MAX_G ? weight : categoryRates(draft.category).weightG
  const ship = shippingFor(weightForEstimate)
  const feeGst = 1 + rates.feeGstRate
  const categoryName = pick({
    en: categories.find((c) => c.id === draft.category)?.name_en ?? '',
    hi: categories.find((c) => c.id === draft.category)?.name_hi ?? '',
  })
  const estimate = (field: 'ship' | 'returnShip' | 'packaging' | 'adPerOrder') => {
    const { value, reason } = {
      ship: { value: ship.forward * feeGst, reason: t('est.ship', { weight: weightForEstimate }) },
      returnShip: { value: ship.reverse * feeGst, reason: t('est.ship', { weight: weightForEstimate }) },
      packaging: { value: categoryRates(draft.category).packagingPerOrder, reason: t('est.category', { category: categoryName }) },
      adPerOrder: { value: rates.adPerOrder, reason: t('est.ads') },
    }[field]
    const entered = draft[field].trim() !== ''
    return {
      chip: <SourceChip source={entered ? 'YOU_ENTERED' : 'ESTIMATED'} title={entered ? undefined : reason} />,
      help: entered ? undefined : `${t('product.estimateValue', { value: inr(value) })} · ${reason}`,
      placeholder: inr(value),
    }
  }

  const hasTouchedError = (Object.keys(validation.errors) as DraftField[]).some((f) => errorFor(f))

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-2">
        <BackButton onClick={back} />
      </div>
      <PageTitle>{product ? t('product.editTitle') : t('product.newTitle')}</PageTitle>

      <form
        className="mt-5 flex flex-col gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <TextField
          label={t('product.name')}
          value={draft.name}
          onChange={set('name')}
          onBlur={touch('name')}
          error={errorFor('name')}
          placeholder={t('product.namePlaceholder')}
          autoFocus={!product}
        />
        <div className="grid gap-5 md:grid-cols-3">
          <TextField
            label={t('product.cost')}
            value={draft.cost}
            onChange={set('cost')}
            onBlur={touch('cost')}
            error={errorFor('cost')}
            help={t('product.costHelp')}
            inputMode="decimal"
          />
          <TextField
            label={t('product.weight')}
            value={draft.weightG}
            onChange={set('weightG')}
            onBlur={touch('weightG')}
            error={errorFor('weightG')}
            help={t('product.weightHelp')}
            inputMode="numeric"
          />
          <TextField
            label={t('product.price')}
            value={draft.price}
            onChange={set('price')}
            onBlur={touch('price')}
            error={errorFor('price')}
            inputMode="decimal"
          />
        </div>

        {validation.costAtLeastPrice ? (
          <p role="alert" className="rounded-card border-2 border-loss bg-loss/5 p-3 text-base font-medium text-loss">
            <span aria-hidden="true">✕ </span>
            {t('product.costWarning')}
          </p>
        ) : null}

        <div className="rounded-card border border-plum/15">
          <button
            type="button"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((o) => !o)}
            className="flex min-h-tap w-full items-center justify-between gap-3 rounded-card px-4 py-3 text-left"
          >
            <span>
              <span className="block text-lg font-semibold text-ink">{t('product.more')}</span>
              <span className="block text-sm text-muted">{t('product.moreHint')}</span>
            </span>
            <span aria-hidden="true" className={`text-xl text-plum transition-transform ${moreOpen ? 'rotate-180' : ''}`}>
              ⌄
            </span>
          </button>
          {moreOpen ? (
            <div className="grid gap-5 border-t border-plum/10 p-4 md:grid-cols-2">
              <CategorySelect value={draft.category} onChange={set('category')} />
              <TextField label={t('product.sku')} value={draft.sku} onChange={set('sku')} onBlur={touch('sku')} error={errorFor('sku')} help={t('product.skuHelp')} optional />
              <TextField label={t('product.ship')} value={draft.ship} onChange={set('ship')} onBlur={touch('ship')} error={errorFor('ship')} inputMode="decimal" {...estimate('ship')} />
              <TextField label={t('product.returnShip')} value={draft.returnShip} onChange={set('returnShip')} onBlur={touch('returnShip')} error={errorFor('returnShip')} inputMode="decimal" {...estimate('returnShip')} />
              <TextField label={t('product.packaging')} value={draft.packaging} onChange={set('packaging')} onBlur={touch('packaging')} error={errorFor('packaging')} inputMode="decimal" {...estimate('packaging')} />
              <TextField label={t('product.adPerOrder')} value={draft.adPerOrder} onChange={set('adPerOrder')} onBlur={touch('adPerOrder')} error={errorFor('adPerOrder')} inputMode="decimal" {...estimate('adPerOrder')} />
              <TextField label={t('product.ordersPerWeek')} value={draft.ordersPerWeek} onChange={set('ordersPerWeek')} onBlur={touch('ordersPerWeek')} error={errorFor('ordersPerWeek')} inputMode="decimal" optional />
              <TextField label={t('product.stock')} value={draft.stock} onChange={set('stock')} onBlur={touch('stock')} error={errorFor('stock')} inputMode="numeric" optional />
              <TextField label={t('product.listedSince')} value={draft.listedSince} onChange={set('listedSince')} onBlur={touch('listedSince')} error={errorFor('listedSince')} type="date" optional />
            </div>
          ) : null}
        </div>

        <StickyActions>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
            <button type="submit" disabled={!validation.valid || saving} className={buttonClass('primary', 'w-full md:w-auto')}>
              {product ? t('product.saveChanges') : t('product.save')}
            </button>
            {!validation.valid ? (
              <p className="text-sm text-muted">{hasTouchedError ? t('product.fixErrors') : t('product.fillRequired')}</p>
            ) : null}
          </div>
        </StickyActions>
      </form>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title={t('discard.title')}
        body={t('discard.body')}
        confirmLabel={t('discard.discard')}
        cancelLabel={t('discard.keep')}
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
    </div>
  )
}

function CategorySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t, pick } = useI18n()
  return (
    <label className="flex flex-col gap-1">
      <span className="text-base font-medium text-ink">{t('product.category')}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-tap w-full min-w-0 rounded-xl border-2 border-plum/20 bg-white px-3 text-base text-ink focus:outline-none focus:ring-2 focus:ring-orange"
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {pick({ en: c.name_en, hi: c.name_hi })}
          </option>
        ))}
      </select>
    </label>
  )
}

