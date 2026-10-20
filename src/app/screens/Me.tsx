/**
 * Me (spec v2, 7.11): shop profile and GST settings, language, reports,
 * share with a seller friend, backup / restore, opt-in anonymous sharing,
 * privacy, how it works, the concept screen, feedback, delete everything.
 *
 * Saving the shop setup recomputes every product and says how many changed
 * status (spec 8.2). Language switches instantly and touches no product data.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { rates } from '../../data/rates'
import { pct } from '../../engine/format'
import { useI18n, useT } from '../../i18n'
import { type Backup, backupFileName, deleteEverything, exportBackup, parseBackup, restoreBackup } from '../backup'
import { queueBenchmarks } from '../benchmarks'
import { type Report, type Shop, db } from '../db'
import { useProducts, useReportLinks, useReports, useShop } from '../hooks'
import { downloadFile } from '../lib/ics'
import { statusChanges } from '../lib/products'
import { LanguageToggle, PhoneFrameToggle } from '../layout'
import { type ReportLink, removeReport, restoreReport } from '../report/store'
import { saveShop } from '../repo'
import { enqueue } from '../telemetry'
import { useToast } from '../toast'
import { Button, Card, Choice, ConfirmDialog, LoadingPage, PageTitle, buttonClass } from '../ui'
import { ShareCard } from './Growth'
import { ShopFields } from './Onboarding'

const linkClass = 'inline-flex min-h-tap items-center text-base font-medium text-plum underline underline-offset-4'

export function Me() {
  const t = useT()
  const shop = useShop()
  const products = useProducts()
  const links = useReportLinks()
  const reports = useReports()
  if (!shop || products === undefined || links === undefined || reports === undefined) return <LoadingPage />

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageTitle>{t('me.title')}</PageTitle>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-ink">{t('me.language')}</h2>
        <LanguageToggle />
      </Card>

      <ShopSetupCard shop={shop} products={products} links={links} hasReports={reports.length > 0} />
      <ReportsCard reports={reports} />
      <ShareCard />
      <BackupCard shop={shop} />
      <SharingCard shop={shop} />
      <FeedbackCard />

      <Card tone="lilac">
        <p className="text-base text-body">{t('me.storage')}</p>
        {shop.storagePersisted === false ? <p className="mt-1 text-sm text-thin">{t('me.storageAtRisk')}</p> : null}
        <div className="mt-3 flex flex-col items-start gap-1">
          <Link to="/privacy" className={linkClass}>
            {t('me.privacy')}
          </Link>
          <Link to="/how-it-works" className={linkClass}>
            {t('me.howItWorks')}
          </Link>
          <Link to="/concept" className={linkClass}>
            {t('me.concept')}
          </Link>
          <PhoneFrameToggle className="-ml-3" />
        </div>
      </Card>

      <DeleteCard />
    </div>
  )
}

// ----------------------------------------------------------- shop setup

type Answers = Pick<Shop, 'category' | 'gstRegistered' | 'buyerRegion' | 'prepaidDiscount' | 'gstRate'>

function ShopSetupCard({
  shop,
  products,
  links,
  hasReports,
}: {
  shop: Shop
  products: Parameters<typeof statusChanges>[0]
  links: Map<string, ReportLink>
  hasReports: boolean
}) {
  const t = useT()
  const toast = useToast()
  const initial: Answers = {
    category: shop.category,
    gstRegistered: shop.gstRegistered,
    buyerRegion: shop.buyerRegion,
    prepaidDiscount: shop.prepaidDiscount,
    gstRate: shop.gstRate,
  }
  const [answers, setAnswers] = useState<Answers>(initial)
  const dirty = (Object.keys(initial) as (keyof Answers)[]).some((k) => answers[k] !== initial[k])

  const save = async () => {
    const changed = statusChanges(products, shop, { ...shop, ...answers }, links)
    await saveShop(answers)
    toast({
      message: changed === 0 ? t('me.saved') : changed === 1 ? t('me.changedOne') : t('me.changed', { n: changed }),
    })
  }

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-ink">{t('me.shop')}</h2>
      {hasReports ? <p className="mb-4 rounded-card bg-lilac p-3 text-sm text-body">{t('me.reportNote')}</p> : null}
      <ShopFields value={answers} onChange={(patch) => setAnswers((a) => ({ ...a, ...patch }))} />
      {answers.gstRegistered ? (
        <div className="mt-7">
          <Choice<string>
            legend={t('me.gstRate')}
            hint={t('me.gstRateHint')}
            columns={3}
            value={answers.gstRate === null ? 'default' : String(answers.gstRate)}
            onChange={(v) => setAnswers((a) => ({ ...a, gstRate: v === 'default' ? null : Number(v) }))}
            options={[
              { value: 'default', label: t('me.gstDefault') },
              ...rates.outputGstChoices.map((r) => ({ value: String(r), label: pct(r, 0) })),
            ]}
          />
        </div>
      ) : null}
      <Button className="mt-6 w-full sm:w-auto" disabled={!dirty} onClick={() => void save()}>
        {t('me.save')}
      </Button>
    </Card>
  )
}

/** Me → Reports → Remove (spec 8.2): the products fall back to estimates, with Undo. */
function ReportsCard({ reports }: { reports: Report[] }) {
  const { t, lang } = useI18n()
  const toast = useToast()
  const fmt = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  const remove = async (id: string) => {
    const removed = await removeReport(id)
    if (removed) toast({ message: t('me.reportRemoved'), onUndo: () => void restoreReport(removed) })
  }
  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold text-ink">{t('me.reports')}</h2>
      {reports.length === 0 ? (
        <p className="text-base text-body/80">{t('me.noReports')}</p>
      ) : (
        <ul className="divide-y divide-plum/10">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <Link to={`/upload/done/${r.id}`} className="block break-all text-base font-medium text-plum underline-offset-2 hover:underline">
                  {r.fileName}
                </Link>
                <p className="text-sm text-muted">
                  {t('me.reportLine', { date: fmt.format(new Date(r.uploadedAt)) })}
                  {r.synthetic ? ` · ${t('done.sampleChip')}` : ''}
                </p>
              </div>
              <Button variant="ghost" onClick={() => void remove(r.id)}>
                {t('me.removeReport')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// --------------------------------------------------------------- backup

function BackupCard({ shop }: { shop: Shop }) {
  const { t, lang } = useI18n()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Backup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const last = useLiveQuery(async () => ((await db.kv.get('lastBackupAt'))?.value as number | undefined) ?? null, [])
  const fmt = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

  const download = async () => {
    const backup = await exportBackup()
    downloadFile(backupFileName(), JSON.stringify(backup, null, 1), 'application/json')
  }

  const pick = async (file: File | undefined) => {
    if (!file) return
    const text = await file.text()
    const parsed = parseBackup(text, db.verno)
    if (parsed === 'notBackup') setError(t('backup.notBackup'))
    else if (parsed === 'newerSchema') setError(t('backup.newer'))
    else {
      setError(null)
      setPending(parsed)
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-ink">{t('backup.title')}</h2>
      <p className="text-base text-body">{t('backup.body')}</p>
      <p className="text-sm text-muted">{last ? t('backup.last', { date: fmt.format(new Date(last)) }) : t('backup.never')}</p>
      {shop.storagePersisted === false ? <p className="text-sm font-medium text-thin">{t('backup.atRisk')}</p> : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={() => void download()}>{t('backup.download')}</Button>
        <label className={buttonClass('secondary', 'cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-orange')}>
          {t('backup.restore')}
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-medium text-loss">
          {error}
        </p>
      ) : null}
      <ConfirmDialog
        open={pending !== null}
        title={t('backup.confirmTitle')}
        body={pending ? t('backup.confirmBody', { date: fmt.format(new Date(pending.exportedAt)) }) : ''}
        confirmLabel={t('backup.confirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          if (!pending) return
          void restoreBackup(pending).then(() => toast({ message: t('backup.restored') }))
          setPending(null)
        }}
        onCancel={() => setPending(null)}
      />
    </Card>
  )
}

// ---------------------------------------------------- anonymous sharing

function SharingCard({ shop }: { shop: Shop }) {
  const t = useT()
  const id = useId()
  const toggle = async () => {
    const next = !shop.shareOptIn
    await saveShop({ shareOptIn: next })
    if (next) await queueBenchmarks(null)
  }
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={id} className="text-lg font-semibold text-ink">
            {t('optin.title')}
          </h2>
          <p className="mt-1 text-base text-body">{t('optin.body')}</p>
        </div>
        {/* 48 px tap target around a 32 px track. */}
        <button
          type="button"
          role="switch"
          aria-checked={shop.shareOptIn}
          aria-labelledby={id}
          onClick={() => void toggle()}
          className="inline-flex min-h-tap min-w-tap shrink-0 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange"
        >
          <span className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${shop.shareOptIn ? 'bg-healthy' : 'bg-body/30'}`}>
            <span className={`inline-block h-6 w-6 rounded-full bg-white transition-transform ${shop.shareOptIn ? 'translate-x-7' : 'translate-x-1'}`} />
          </span>
        </button>
      </div>
      <p className="text-sm font-medium text-muted">{shop.shareOptIn ? t('optin.on') : t('optin.off')}</p>
    </Card>
  )
}

// ------------------------------------------------------------- feedback

function FeedbackCard() {
  const { t, lang } = useI18n()
  const [stars, setStars] = useState<string>('')
  const [text, setText] = useState('')
  const [sent, setSent] = useState(false)
  const textId = useId()
  if (sent) {
    return (
      <Card>
        <p role="status" className="text-base font-semibold text-healthy">
          {t('feedback.thanks')}
        </p>
      </Card>
    )
  }
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-ink">{t('feedback.title')}</h2>
      <Choice<string>
        legend={t('feedback.stars')}
        columns={4}
        value={stars}
        onChange={setStars}
        options={['1', '2', '3', '4', '5'].map((s) => ({ value: s, label: '★'.repeat(Number(s)) }))}
      />
      <label htmlFor={textId} className="text-base font-medium text-ink">
        {t('feedback.text')}
      </label>
      <textarea
        id={textId}
        value={text}
        maxLength={500}
        rows={3}
        onChange={(e) => setText(e.target.value)}
        className="w-full min-w-0 rounded-xl border-2 border-plum/20 p-3 text-base focus:outline-none focus:ring-2 focus:ring-orange"
      />
      <p className="text-sm text-muted">{t('feedback.note')}</p>
      <Button
        className="self-start"
        disabled={stars === ''}
        onClick={() => {
          void enqueue('feedback', { stars: Number(stars), text: text.trim().slice(0, 500), lang })
          setSent(true)
        }}
      >
        {t('feedback.send')}
      </Button>
    </Card>
  )
}

// ------------------------------------------------------ delete everything

/** Two confirmations; the second asks for DELETE or हटाएं typed out (spec 7.11). */
function DeleteCard() {
  const t = useT()
  const navigate = useNavigate()
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [typed, setTyped] = useState('')
  const inputId = useId()
  const ok = typed.trim().toUpperCase() === 'DELETE' || typed.trim() === 'हटाएं'

  const run = async () => {
    await deleteEverything()
    setStep(0)
    navigate('/', { replace: true })
  }

  return (
    <Card className="flex flex-col gap-2 border-2 border-loss/30">
      <h2 className="text-lg font-semibold text-loss">{t('delete.title')}</h2>
      <p className="text-base text-body">{t('delete.body')}</p>
      <Button variant="danger" className="self-start" onClick={() => setStep(1)}>
        {t('delete.button')}
      </Button>

      <ConfirmDialog
        open={step === 1}
        title={t('delete.confirm1Title')}
        body={t('delete.confirm1Body')}
        confirmLabel={t('delete.confirm1Button')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          setTyped('')
          setStep(2)
        }}
        onCancel={() => setStep(0)}
      />

      {step === 2 ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
          <div role="alertdialog" aria-modal="true" aria-labelledby={`${inputId}-t`} className="w-full max-w-sm rounded-card bg-white p-5">
            <h2 id={`${inputId}-t`} className="text-xl font-bold text-loss">
              {t('delete.confirm2Title')}
            </h2>
            <label htmlFor={inputId} className="mt-3 block text-base text-body">
              {t('delete.confirm2Label')}
            </label>
            <input
              id={inputId}
              value={typed}
              autoFocus
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
              className="mt-2 min-h-tap w-full rounded-xl border-2 border-loss/40 px-3 text-base focus:outline-none focus:ring-2 focus:ring-orange"
            />
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="danger" disabled={!ok} onClick={() => void run()}>
                {t('delete.final')}
              </Button>
              <Button onClick={() => setStep(0)}>{t('common.cancel')}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  )
}
