// @vitest-environment jsdom
/**
 * Report upload in a real DOM (spec 7.3; Section 15 negatives 6–9): pick a
 * file, read it with SheetJS, reconcile, add costs; plus the PDF, duplicate,
 * renamed-columns and back-from-mapping paths.
 */
import 'fake-indexeddb/auto'
import './domShim'

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '../../src/app/db'
import { saveShop } from '../../src/app/repo'
import { routes } from '../../src/app/routes'
import { I18nProvider } from '../../src/i18n'
import { SYNTHETIC_DIR } from '../fixtures/reports/loadReport'

function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: ['/home', path], initialIndex: 1 })
  render(
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>,
  )
  return router
}

const fixture = (name: string) => new File([readFileSync(join(SYNTHETIC_DIR, name))], name)

async function pick(file: File) {
  const input = (await screen.findByLabelText('Choose report file')) as HTMLInputElement
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } })
  })
}

beforeEach(async () => {
  window.scrollTo = vi.fn() as never
  localStorage.clear()
  if (!db.isOpen()) await db.open()
  for (const table of db.tables) await table.clear()
  await saveShop({ language: 'en', onboardedAt: 1 })
})

afterEach(() => cleanup())

describe('uploading a Meesho report', () => {
  it('reads it, shows the reconciliation, and turns costs into products', async () => {
    const router = renderApp('/upload')
    await pick(fixture('SAMPLE_SYNTHETIC_PAYMENT_FILE_week1.xlsx'))

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/upload\/done\//), { timeout: 5000 })
    expect(await screen.findByRole('heading', { name: 'Your report is in' })).toBeTruthy()
    expect(screen.getByText("SAMPLE report: synthetic data, not a real seller's.")).toBeTruthy()
    expect(screen.getByText(/5 products · 459 order lines/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'We found 5 products. Add their cost to see what you keep.' })).toBeTruthy()
    expect(screen.getAllByText(/Matches your report ✓/).length).toBeGreaterThan(0)

    // Add the kurti's cost.
    const kurtiCard = screen.getByText('Blue Rayon Kurti').closest('li')!
    fireEvent.change(within(kurtiCard).getByLabelText('Your cost (₹ per piece)'), { target: { value: '150' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and see what I keep' }))
    expect(await screen.findByText('1 product saved')).toBeTruthy()
    await waitFor(async () => expect(await db.products.count()).toBe(1))
    expect(await screen.findByRole('heading', { name: 'Products you already added' })).toBeTruthy()

    // The leak finder now uses the report.
    await act(() => router.navigate('/home'))
    expect(await screen.findByText('Blue Rayon Kurti')).toBeTruthy()
    expect(screen.getByText('From your report')).toBeTruthy()
    expect(screen.getByText('From your reports.')).toBeTruthy()
  })

  it('refuses the same file twice (negative 8)', async () => {
    renderApp('/upload')
    await pick(fixture('SAMPLE_SYNTHETIC_PAYMENT_FILE_week1.xlsx'))
    await screen.findByRole('heading', { name: 'Your report is in' }, { timeout: 5000 })
    cleanup()

    renderApp('/upload')
    await pick(fixture('SAMPLE_SYNTHETIC_PAYMENT_FILE_week1.xlsx'))
    expect(await screen.findByText(/^Already uploaded on /, {}, { timeout: 5000 })).toBeTruthy()
    expect(await db.reports.count()).toBe(1)
  })

  it('refuses the same report under different bytes (the CSV of an uploaded week)', async () => {
    renderApp('/upload')
    await pick(fixture('SAMPLE_SYNTHETIC_PAYMENT_FILE_week1.xlsx'))
    await screen.findByRole('heading', { name: 'Your report is in' }, { timeout: 5000 })
    cleanup()

    renderApp('/upload')
    await pick(fixture('SAMPLE_SYNTHETIC_PAYMENT_FILE_week1_order_payments.csv'))
    expect(await screen.findByText(/^Already uploaded on /, {}, { timeout: 5000 })).toBeTruthy()
    expect(await db.reports.count()).toBe(1)
  })

  it('rejects a PDF with a clear message (negative 6)', async () => {
    renderApp('/upload')
    await pick(new File(['%PDF-1.7 fake'], 'payments.pdf', { type: 'application/pdf' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringMatching(/This is a PDF/))
    await pick(new File(['%PDF-1.7 fake'], 'renamed.xlsx'))
    expect((await screen.findByRole('alert')).textContent).toMatch(/This is a PDF/)
    expect(await db.reports.count()).toBe(0)
  })
})

describe('"Try with a sample report" (demo)', () => {
  /** The app fetches /samples/*.xlsx; here they come straight from public/samples. */
  const servePublic = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const m = /^\/samples\/([\w.]+)$/.exec(url)
        if (!m) return new Response(null, { status: 404 })
        return new Response(readFileSync(join(__dirname, '..', '..', 'public', 'samples', m[1]!)))
      }),
    )
  afterEach(() => vi.unstubAllGlobals())

  it('loads both sample weeks, labelled SAMPLE, sends sample:true, and never counts as activated', async () => {
    servePublic()
    const router = renderApp('/upload')
    fireEvent.click(await screen.findByRole('button', { name: 'Try with a sample report' }))
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/upload\/done\//), { timeout: 5000 })
    expect(await screen.findByText("SAMPLE report: synthetic data, not a real seller's.")).toBeTruthy()

    const reports = await db.reports.toArray()
    expect(reports.map((r) => [r.fileName, r.synthetic]).sort()).toEqual([
      ['SAMPLE_SYNTHETIC_PAYMENT_FILE_week1.xlsx', true],
      ['SAMPLE_SYNTHETIC_PAYMENT_FILE_week2.xlsx', true],
    ])
    expect(router.state.location.pathname).toBe(`/upload/done/${reports.find((r) => r.fileName.includes('week2'))!.id}`)
    await waitFor(async () => {
      const uploads = (await db.outbox.toArray()).filter((r) => r.payload.name === 'report_uploaded')
      expect(uploads.map((r) => r.payload.props)).toEqual([
        { products: 5, sample: true },
        { products: 5, sample: true },
      ])
    })

    // Adding a cost makes a product with (sample) report numbers: still not an activated seller.
    const kurtiCard = screen.getByText('Blue Rayon Kurti').closest('li')!
    fireEvent.change(within(kurtiCard).getByLabelText('Your cost (₹ per piece)'), { target: { value: '150' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and see what I keep' }))
    expect(await screen.findByText('1 product saved')).toBeTruthy()
    await act(() => router.navigate('/home'))
    expect(await screen.findByText('Blue Rayon Kurti')).toBeTruthy()
    expect(screen.getByText('Sample')).toBeTruthy()
    expect(await db.kv.get('once:activated')).toBeUndefined()

    // Trying again reuses what's loaded.
    await act(() => router.navigate('/upload'))
    fireEvent.click(await screen.findByRole('button', { name: 'Try with a sample report' }))
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/upload\/done\//), { timeout: 5000 })
    expect(await db.reports.count()).toBe(2)
  })

  it('says so when the sample can\'t be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })))
    renderApp('/upload')
    fireEvent.click(await screen.findByRole('button', { name: 'Try with a sample report' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/sample report couldn't be loaded/)
    expect(await db.reports.count()).toBe(0)
  })
})

describe('renamed columns → mapping screen → correct result (negative 7)', () => {
  const csv = [
    'Order Ref,Item Code,Item,State,Paid,Buyer Mobile',
    'A1,K-1,Blue kurti,Delivered,239.27,9800000001',
    'A2,K-1,Blue kurti,Delivered,239.27,9800000002',
    'A3,K-1,Blue kurti,Return,-200.60,9800000003',
    'A4,K-1,Blue kurti,RTO,0,9800000004',
  ].join('\n')

  it('asks for the missing columns, never shows the phone column, and saves the mapping', async () => {
    const router = renderApp('/upload')
    await pick(new File([csv], 'export.csv', { type: 'text/csv' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/upload/map'), { timeout: 5000 })
    expect(screen.getByRole('heading', { name: 'Match your columns' })).toBeTruthy()
    expect(screen.getByText(/hidden and never read/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Buyer Mobile|98000000/)

    const continueBtn = screen.getByRole('button', { name: 'Use these columns' }) as HTMLButtonElement
    expect(continueBtn.disabled).toBe(true)

    const choose = (q: string, header: string) => {
      const select = screen.getByLabelText(q) as HTMLSelectElement
      const option = [...select.options].find((o) => o.textContent === header)!
      fireEvent.change(select, { target: { value: option.value } })
    }
    choose('Which column is the product SKU?', 'Item Code')
    choose('Which column is the order status?', 'State')
    choose('Which column is the amount you were paid (settlement)?', 'Paid')
    expect(await screen.findByText('e.g. Delivered, Delivered, Return')).toBeTruthy()
    expect(continueBtn.disabled).toBe(false)

    fireEvent.click(continueBtn)
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/upload\/done\//), { timeout: 5000 })
    expect(await screen.findByText(/1 products · 4 order lines/)).toBeTruthy()

    const rows = await db.skuStats.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ sku: 'K-1', orders: 4, deliveredKept: 2, returns: 1, rto: 1 })
    expect(JSON.stringify(await db.mappings.toArray())).toMatch(/"sku":"Item Code"/)
    expect(JSON.stringify(rows)).not.toMatch(/98000000/)

    // A second file with the same layout uses the saved mapping: no mapping screen.
    cleanup()
    const router2 = renderApp('/upload')
    await pick(new File([csv.replace(/239\.27/g, '240.00')], 'export-2.csv', { type: 'text/csv' }))
    await waitFor(() => expect(router2.state.location.pathname).toMatch(/^\/upload\/done\//), { timeout: 5000 })
  })

  it('shows the rows it ignored, and "Check columns" reopens the mapping pre-filled and re-reads the file', async () => {
    const file = [
      'Sub Order No,Supplier SKU,Live Order Status,Final Settlement Amount,Order Date',
      'S1,K-1,Delivered,239.27,2026-09-28',
      'S2,K-1,Delivered,239.27,2026-09-29',
      'S3,K-1,In transit,239.27,2026-09-30',
      'S4,K-1,RTO,0,2026-09-30',
    ].join('\n')
    const router = renderApp('/upload')
    await pick(new File([file], 'week.csv', { type: 'text/csv' }))
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/upload\/done\//), { timeout: 5000 })
    expect(await screen.findByText('1 row ignored: In transit')).toBeTruthy()
    expect(screen.getByText(/1 products · 3 order lines/)).toBeTruthy()
    const firstId = (await db.reports.toArray())[0]!.id

    fireEvent.click(screen.getByRole('link', { name: 'Check columns' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/upload/map'))
    expect(screen.getByText(/These are the columns we read/)).toBeTruthy()
    const sku = screen.getByLabelText('Which column is the product SKU?') as HTMLSelectElement
    expect(sku.options[sku.selectedIndex]!.textContent).toBe('Supplier SKU')

    // Back returns to the same report, file still in memory.
    fireEvent.click(screen.getByRole('button', { name: /Back/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/upload/done/${firstId}`))
    fireEvent.click(await screen.findByRole('link', { name: 'Check columns' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/upload/map'))

    // Re-reading without the date column replaces the saved report.
    const date = screen.getByLabelText('Which column is the order date?') as HTMLSelectElement
    fireEvent.change(date, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Use these columns' }))
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/upload\/done\//), { timeout: 5000 })
    expect(router.state.location.pathname).not.toBe(`/upload/done/${firstId}`)
    const reports = await db.reports.toArray()
    expect(reports).toHaveLength(1)
    expect(reports[0]!.periodFrom).toBeUndefined()
  })

  it('Back from the mapping screen returns to upload and discards the file (8.2)', async () => {
    const router = renderApp('/upload')
    await pick(new File([csv], 'export.csv', { type: 'text/csv' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/upload/map'), { timeout: 5000 })
    fireEvent.click(screen.getByRole('button', { name: /Back/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/upload'))
    // The file is gone: going forward to /upload/map has nothing to map.
    await act(() => router.navigate('/upload/map'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/upload'))
    expect(await db.reports.count()).toBe(0)
  })
})
