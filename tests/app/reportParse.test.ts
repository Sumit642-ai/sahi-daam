import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { detectColumns, isPersonal, normalizeHeader } from '../../src/app/report/columns'
import {
  analyseWorkbook,
  buildReport,
  checkFileBytes,
  checkFileMeta,
  columnsByName,
  MAX_FILE_BYTES,
} from '../../src/app/report/extract'
import { sha256Hex, sha256HexSync } from '../../src/app/report/hash'
import type { Grid } from '../../src/app/report/read'
import { daysInclusive, toIsoDate, toNumber } from '../../src/app/report/values'
import { REAL_DIR, SYNTHETIC_DIR, analyseFile, loadReport, reportFilesIn } from '../fixtures/reports/loadReport'

const fixtures = [...reportFilesIn(SYNTHETIC_DIR), ...reportFilesIn(REAL_DIR)]

describe('keyword column detection on every fixture (spec 7.3)', () => {
  it('has fixtures to test', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(4)
  })

  it.each(fixtures.map((f) => [basename(f), f]))('%s: finds every column without exact names', (_name, file) => {
    const a = analyseFile(file)
    expect(a.missing).toEqual([])
    expect(a.order.name).toMatch(/order payments|order_payments|sheet1/i)
    const found = columnsByName(a.order, a.columns)
    expect(found).toMatchObject({
      sku: 'Supplier SKU',
      status: 'Live Order Status',
      settlement: 'Final Settlement Amount',
      subOrderNo: 'Sub Order No',
      productName: 'Product Name',
      quantity: 'Quantity',
      listingPrice: 'Listing Price (Incl. taxes)',
      shipping: 'Shipping Charge (Incl. GST)',
      returnShipping: 'Return Shipping Charge (Incl. GST)',
      tcs: 'TCS',
      tds: 'TDS',
      orderDate: 'Order Date',
    })
  })

  it.each(fixtures.map((f) => [basename(f), f]))('%s: drops the buyer-name column before reading values', (_name, file) => {
    const a = analyseFile(file)
    expect(a.personalHeaders).toEqual(['Customer Name'])
    expect(a.order.headers).not.toContain('Customer Name')
    expect(JSON.stringify(a)).not.toMatch(/TEST BUYER/)
    // A state is a region, not a person: it stays.
    expect(a.order.headers).toContain('Customer State')
  })

  it.each(fixtures.map((f) => [basename(f), f]))('%s: is recognised as a SAMPLE / SYNTHETIC report', (_name, file) => {
    if (file.startsWith(REAL_DIR)) return
    expect(analyseFile(file).synthetic).toBe(true)
  })
})

const grid = (rows: unknown[][], name = 'Order Payments'): Grid[] => [{ name, rows }]

describe('header variants a real report might use', () => {
  it('finds the header under title rows, in any case or punctuation', () => {
    const a = analyseWorkbook(
      grid([
        ['Meesho Payments Report'],
        ['Generated on 05-10-2026'],
        [],
        ['SUB_ORDER_ID', 'SUPPLIER_SKU', 'Order Status', 'Settlement Amount (INR)', 'Buyer Phone', 'Address Line 1'],
        ['A1', 'K-1', 'Delivered', '₹239.27', '98xxxxxx01', 'Somewhere'],
      ]),
      'payments.xlsx',
    )
    if ('error' in a) throw new Error()
    expect(a.missing).toEqual([])
    expect(columnsByName(a.order, a.columns)).toMatchObject({
      subOrderNo: 'SUB_ORDER_ID',
      sku: 'SUPPLIER_SKU',
      status: 'Order Status',
      settlement: 'Settlement Amount (INR)',
    })
    expect(a.personalHeaders).toEqual(['Buyer Phone', 'Address Line 1'])
    expect(JSON.stringify(a)).not.toMatch(/98xxxxxx01|Somewhere/)
  })

  it('prefers the order status over a payment status', () => {
    const cols = detectColumns(['Payment Status', 'Live Order Status', 'SKU', 'Final Settlement Amount'], [['Paid', 'RTO', 'X', '0']])
    expect(cols.status).toBe(1)
  })

  it('uses the values to pick the status column when headers are vague', () => {
    const cols = detectColumns(['Status', 'Sub Status', 'SKU', 'Settlement'], [['Done', 'Delivered', 'X', '10']])
    expect(cols.status).toBe(1)
  })

  it('never takes "Total Sale Amount (Incl. Shipping & GST)" as the shipping charge', () => {
    const cols = detectColumns(['Total Sale Amount (Incl. Shipping & GST)', 'Shipping Charge (Incl. GST)'])
    expect(cols.shipping).toBe(1)
  })

  it('reports what it could not find, so the mapping screen opens', () => {
    const a = analyseWorkbook(grid([['Item Code', 'State', 'Paid'], ['K-1', 'Delivered', '239']]), 'renamed.csv')
    if ('error' in a) throw new Error()
    expect(a.missing).toEqual(['sku', 'status', 'settlement'])
  })

  it('reuses a saved mapping for the same layout', () => {
    const rows = [['Item Code', 'State', 'Paid'], ['K-1', 'Delivered', '239']]
    const first = analyseWorkbook(grid(rows), 'a.csv')
    if ('error' in first) throw new Error()
    const saved = { id: first.signature, columns: { sku: 'Item Code', status: 'State', settlement: 'Paid' } }
    const again = analyseWorkbook(grid(rows), 'b.csv', [saved])
    if ('error' in again) throw new Error()
    expect(again.mappingSource).toBe('saved')
    expect(again.missing).toEqual([])
    expect(again.columns).toEqual({ sku: 0, status: 1, settlement: 2 })
  })

  it('an empty workbook is an error, not a crash', () => {
    expect(analyseWorkbook(grid([]), 'x.xlsx')).toEqual({ error: 'empty' })
  })

  it.each([
    ['Customer Name', true],
    ['Buyer Phone', true],
    ['Mobile No.', true],
    ['Shipping Address', true],
    ['Pincode', true],
    ['Customer Email', true],
    ['Product Name', false],
    ['Customer State', false],
    ['Supplier SKU', false],
  ])('"%s" personal: %s', (h, personal) => expect(isPersonal(h)).toBe(personal))

  it('normalises headers', () => {
    expect(normalizeHeader(' Final_Settlement-Amount (INR) ')).toBe('final settlement amount inr')
  })
})

describe('per-product totals through the whole pipeline (Section 15, positive 2)', () => {
  const expected = JSON.parse(readFileSync(join(SYNTHETIC_DIR, 'expected_totals.json'), 'utf8'))

  it.each(reportFilesIn(SYNTHETIC_DIR).map((f) => [basename(f), f]))('%s', (_name, file) => {
    const week = basename(file).match(/week\d/)![0]
    const { data } = loadReport(file)
    expect(data.orderLines).toBe(expected[week].rows)
    expect(data.hasOrders).toBe(true)
    expect(data.periodDays).toBe(7)
    for (const [sku, e] of Object.entries<Record<string, number>>(expected[week].skus)) {
      const s = data.stats.get(sku)!
      expect(s.dispatched, sku).toBe(e.dispatched)
      expect(s.deliveredKept, sku).toBe(e.delivered_kept)
      expect(s.returns, sku).toBe(e.customer_returns)
      expect(s.rto, sku).toBe(e.rto)
      expect(Math.round(s.rtoRate * 10_000) / 100, sku).toBe(e.rto_pct)
      expect(Math.round(s.returnRate * 10_000) / 100, sku).toBe(e.return_pct_of_delivered)
      expect(s.netSettlement, sku).toBeCloseTo(e.net_settlement!, 2)
    }
  })

  it('splits a SKU-less ads total by orders and links compensation to its product', () => {
    const { data } = loadReport(join(SYNTHETIC_DIR, 'SAMPLE_SYNTHETIC_PAYMENT_FILE_week1.xlsx'))
    expect(data.adsSplitByOrders).toBe(true)
    const adsTotal = [...data.adsBySku!.values()].reduce((a, b) => a + b, 0)
    expect(adsTotal).toBeCloseTo(1800, 6)
    expect(data.adsBySku!.get('KURTI-BLUE-01')).toBeCloseTo((1800 * 120) / 450, 6)
    // ₹141.60 paid to the seller for a damaged return lowers the kurti's costs.
    expect(data.penaltiesBySku!.get('KURTI-BLUE-01')).toBeCloseTo(-141.6, 6)
  })

  it('a CSV of one sheet has no ads or compensation data (null, not 0)', () => {
    const { data } = loadReport(join(SYNTHETIC_DIR, 'SAMPLE_SYNTHETIC_PAYMENT_FILE_week1_order_payments.csv'))
    expect(data.adsBySku).toBeNull()
    expect(data.penaltiesBySku).toBeNull()
  })

  it('a file with no delivered or returned orders says so', () => {
    const a = analyseWorkbook(
      grid([
        ['Supplier SKU', 'Live Order Status', 'Final Settlement Amount'],
        ['K-1', 'RTO', '0'],
        ['K-1', 'Cancelled', '0'],
      ]),
      'x.csv',
    )
    if ('error' in a) throw new Error()
    expect(buildReport(a, a.columns).hasOrders).toBe(false)
  })
})

describe('file checks (Section 15, negative 6)', () => {
  it('rejects a PDF, by name or by its bytes', () => {
    expect(checkFileMeta('payments.pdf', 1000)).toBe('upload.err.pdf')
    const pdf = new TextEncoder().encode('%PDF-1.7 ...')
    expect(checkFileBytes('renamed.xlsx', pdf)).toBe('upload.err.pdf')
  })

  it('rejects other file types and files over 10 MB', () => {
    expect(checkFileMeta('notes.docx', 1000)).toBe('upload.err.type')
    expect(checkFileMeta('photo.jpg', 1000)).toBe('upload.err.type')
    expect(checkFileMeta('big.xlsx', MAX_FILE_BYTES + 1)).toBe('upload.err.size')
    expect(checkFileMeta('ok.xlsx', MAX_FILE_BYTES)).toBeNull()
    expect(checkFileMeta('ok.CSV', 10)).toBeNull()
  })

  it('rejects an .xlsx that is not really a spreadsheet', () => {
    expect(checkFileBytes('fake.xlsx', new TextEncoder().encode('hello'))).toBe('upload.err.unreadable')
    expect(checkFileBytes('real.xlsx', readFileSync(join(SYNTHETIC_DIR, 'SAMPLE_SYNTHETIC_PAYMENT_FILE_week1.xlsx')))).toBeNull()
  })
})

describe('cell values', () => {
  it.each([
    [239.27, 239.27],
    ['-59.0', -59],
    ['₹1,200.50', 1200.5],
    ['(59.00)', -59],
    ['INR 300', 300],
    ['', undefined],
    ['n/a', undefined],
    [null, undefined],
  ])('toNumber(%j) = %j', (v, n) => expect(toNumber(v)).toBe(n))

  it.each([
    ['2026-09-28', '2026-09-28'],
    ['2026-09-28 14:03:00', '2026-09-28'],
    ['28-09-2026', '2026-09-28'],
    ['28/09/2026', '2026-09-28'],
    [46293, '2026-09-28'],
    [new Date(2026, 8, 28), '2026-09-28'],
    ['soon', undefined],
  ])('toIsoDate(%j) = %j', (v, d) => expect(toIsoDate(v)).toBe(d))

  it('counts days inclusively', () => {
    expect(daysInclusive('2026-09-28', '2026-10-04')).toBe(7)
  })
})

describe('file hash', () => {
  it('matches the SHA-256 test vector', () => {
    expect(sha256HexSync(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(sha256HexSync(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('Web Crypto and the plain-JS fallback agree on a real file', async () => {
    const bytes = new Uint8Array(readFileSync(join(SYNTHETIC_DIR, 'SAMPLE_SYNTHETIC_PAYMENT_FILE_week1.xlsx')))
    expect(await sha256Hex(bytes)).toBe(sha256HexSync(bytes))
  })
})
