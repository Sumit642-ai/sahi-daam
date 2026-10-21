// @vitest-environment jsdom
/**
 * Phase C screens in a real DOM: the floor card, the price helper and the
 * sale check (spec 7.6–7.7; Section 15 positives 5–6, negatives 3–4).
 */
import 'fake-indexeddb/auto'
import './domShim'

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '../../src/app/db'
import { addProduct, saveCompetitorPrices, saveShop, type ProductInput } from '../../src/app/repo'
import { routes } from '../../src/app/routes'
import { I18nProvider } from '../../src/i18n'

const DAY = 86_400_000
const kurti: ProductInput = { name: 'Blue kurti', category: 'ethnic_women', cost: 150, weightG: 350, price: 300 }

function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: ['/home', path], initialIndex: 1 })
  render(
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>,
  )
  return router
}

/** A product listed 45 days ago: auto stage "Growing". */
async function seed(patch: Partial<ProductInput> = {}) {
  const listed = new Date(Date.now() - 45 * DAY).toISOString().slice(0, 10)
  return addProduct({ ...kurti, listedSince: listed, ...patch })
}

beforeEach(async () => {
  window.scrollTo = vi.fn() as never
  localStorage.clear()
  await db.delete()
  await db.open()
  await saveShop({ language: 'en', onboardedAt: 1 })
})

afterEach(() => cleanup())

describe('floor card (7.6)', () => {
  it('shows the answer, what to do with a rupee effect, and the why table with working', async () => {
    const p = await seed()
    await saveCompetitorPrices(p.id, [280, 300, 320, 340, 350])
    renderApp(`/products/${p.id}`)
    expect(await screen.findByText('At ₹300 you keep ₹30 per sale')).toBeTruthy()
    expect(screen.getByText('You think you make ₹150 (price − cost)')).toBeTruthy()
    expect(screen.getByText('Of 100 orders you send, about 70 become sales you keep.')).toBeTruthy()

    // Growing: one ₹10 step, worth +₹10 / 1.05 a sale for a registered seller.
    const todo = screen.getByRole('heading', { name: 'What to do' }).closest('div')!
    expect(within(todo).getByText('Change your price to ₹310')).toBeTruthy()
    expect(within(todo).getByText("You'd keep ₹39 a sale (+₹10)")).toBeTruthy()

    const why = screen.getByRole('heading', { name: 'Why: what each sale has to cover' }).closest('div')!.parentElement!
    expect(within(why).getByRole('rowheader', { name: /Your floor/ })).toBeTruthy()
    expect(within(why).getByRole('cell', { name: '₹269' })).toBeTruthy()
    expect(within(why).queryByText(/Meesho absorbs|COD handling/)).toBeNull()

    fireEvent.click(within(why).getByRole('button', { name: 'Show working' }))
    expect(await within(why).findByText(/^83 × ₹50\.00 = ₹4,150\.00 on 100 orders sent ÷ 69\.97 clean sales$/)).toBeTruthy()
    expect(within(why).getByRole('cell', { name: '₹268.74' })).toBeTruthy()
    expect(within(why).getByText('₹1,028.47 claimed back as input credit')).toBeTruthy()
  })
})

describe('price helper (7.6)', () => {
  it('fades the range under 3 prices, flags outliers, then recommends at or above the floor (negative 3, positive 5)', async () => {
    const p = await seed()
    renderApp(`/products/${p.id}/price`)
    const input = await screen.findByLabelText('Price of a similar product (₹)')
    const add = (v: string) => {
      fireEvent.change(input, { target: { value: v } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    }

    add('300')
    add('320')
    expect(await screen.findByText("Add 3 similar products' prices to get a suggestion.")).toBeTruthy()
    expect(await screen.findByText('2 of 10 prices')).toBeTruthy()
    // No suggestion yet: the price holds, and there is nothing to apply.
    expect(screen.getByText('At ₹300 you keep ₹30 per sale')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Use this price|Try ₹10 more/ })).toBeNull()

    add('340')
    add('1500') // over 300% of the median
    await waitFor(() => expect(screen.queryByText(/to get a suggestion/)).toBeNull())
    expect(await screen.findByText('Outlier?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove ₹1,500' }))
    await waitFor(() => expect(screen.queryByText('Outlier?')).toBeNull())

    // Growing at ₹300: ₹300 – ₹310.
    expect(screen.getByText('₹300 – ₹310')).toBeTruthy()
    expect(screen.getByText('At ₹310 you keep ₹39 per sale')).toBeTruthy()
  })

  it('switches stage by hand and back to automatic', async () => {
    const p = await seed()
    await saveCompetitorPrices(p.id, [280, 300, 320, 340, 350])
    renderApp(`/products/${p.id}/price`)
    fireEvent.click(await screen.findByRole('radio', { name: 'Launch' }))
    expect(await screen.findByText('₹275 – ₹320')).toBeTruthy()
    expect(screen.getByText(/You chose this. Automatic would be: Growing./)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use the automatic stage' }))
    expect(await screen.findByText('₹300 – ₹310')).toBeTruthy()
  })

  it('warns when the price is above the top quarter of the entered prices (positive 5)', async () => {
    const p = await seed({ price: 360 })
    await saveCompetitorPrices(p.id, [280, 300, 320, 340, 350])
    renderApp(`/products/${p.id}/price`)
    expect(await screen.findByText('Higher than most similar products. Meesho may show it less; move in ₹10 steps.')).toBeTruthy()
  })

  it('floor above every price: not viable, four fixes, and still no price below the floor (negative 4)', async () => {
    const p = await seed()
    await saveCompetitorPrices(p.id, [199, 210, 220, 229])
    renderApp(`/products/${p.id}/price`)
    expect(await screen.findByRole('heading', { name: 'Not viable at these market prices' })).toBeTruthy()
    const card = screen.getByRole('heading', { name: 'Not viable at these market prices' }).parentElement!
    expect(within(card).getAllByRole('listitem')).toHaveLength(4)
    expect(within(card).getByText(/^Sell as a bundle of 2 at ₹/)).toBeTruthy()
    // The recommendation itself never drops below ₹268.74.
    const recommended = screen.getByText(/^At ₹\d+ you keep ₹\d+ per sale$/).textContent!
    expect(Number(recommended.match(/At ₹(\d+)/)![1])).toBeGreaterThanOrEqual(269)
  })

  it('Growing: "Try ₹10 more" starts a price step; Undo removes it (7.9)', async () => {
    const p = await seed()
    await saveCompetitorPrices(p.id, [280, 300, 320, 340, 350])
    renderApp(`/products/${p.id}/price`)
    fireEvent.click(await screen.findByRole('button', { name: 'Try ₹10 more: ₹310' }))
    expect(await screen.findByText(/^Trying ₹310/)).toBeTruthy()
    await waitFor(async () => expect((await db.products.get(p.id))!.price).toBe(310))
    expect(await db.priceHistory.count()).toBe(1)
    expect(await db.priceSteps.toArray()).toMatchObject([{ productId: p.id, oldPrice: 300, newPrice: 310 }])

    // No ratchet: the step is judged before another ₹10 is suggested.
    expect(await screen.findByText(/You changed the price recently/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect((await db.products.get(p.id))!.price).toBe(300))
    expect(await db.priceHistory.count()).toBe(0)
    expect(await db.priceSteps.count()).toBe(0)
  })

  it('other stages: "Use this price" just sets the price, with Undo', async () => {
    const p = await seed()
    await saveCompetitorPrices(p.id, [280, 300, 320, 340, 350])
    renderApp(`/products/${p.id}/price`)
    fireEvent.click(await screen.findByRole('radio', { name: 'Launch' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Use this price: ₹320' }))
    expect(await screen.findByText('Price changed to ₹320')).toBeTruthy()
    await waitFor(async () => expect((await db.products.get(p.id))!.price).toBe(320))
    expect(await db.priceSteps.count()).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect((await db.products.get(p.id))!.price).toBe(300))
  })

  it('a double tap on "Use this price" applies it once', async () => {
    const p = await seed()
    await saveCompetitorPrices(p.id, [280, 300, 320, 340, 350])
    renderApp(`/products/${p.id}/price`)
    fireEvent.click(await screen.findByRole('radio', { name: 'Launch' }))
    const button = await screen.findByRole('button', { name: 'Use this price: ₹320' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(await screen.findByText('Price changed to ₹320')).toBeTruthy()
    await waitFor(async () => expect((await db.products.get(p.id))!.price).toBe(320))
    expect(await db.priceHistory.count()).toBe(1)
  })

  it('shows the floor rounded up, never down (₹268.74 → ₹269)', async () => {
    const p = await seed()
    renderApp(`/products/${p.id}/price`)
    expect(await screen.findByText(/now ₹300 · floor ₹269/)).toBeTruthy()
  })
})

describe('sale check (7.7; Section 15, positive 6)', () => {
  it('default ₹300 kurti, 20% off: skip, every sale loses ₹27', async () => {
    const p = await seed()
    renderApp(`/products/${p.id}/sale`)
    expect(await screen.findByText('Skip: every sale loses ₹27')).toBeTruthy()
    expect(screen.getAllByText('You lose ₹27 per sale at ₹240')).toHaveLength(2) // plain and with prepaid
    expect(screen.getByRole('link', { name: 'Share on WhatsApp' }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=/)
  })

  it('₹500 kurti, 10% off: join, with the exact break-even lift', async () => {
    const p = await seed({ price: 500 })
    renderApp(`/products/${p.id}/sale`)
    fireEvent.click(await screen.findByRole('button', { name: '10%' }))
    expect(await screen.findByText('Join')).toBeTruthy()
    // keep ₹220.25, at ₹450 ₹172.63 → 220.25 / 172.63 − 1 = 27.6%
    expect(screen.getAllByText('Joining pays off only if your orders rise by more than 28%.').length).toBeGreaterThan(0)
  })

  it('₹400 kurti, 10% off: the seller expecting 50% more orders tips it to join', async () => {
    const p = await seed({ price: 400 })
    renderApp(`/products/${p.id}/sale`)
    fireEvent.click(await screen.findByRole('button', { name: '10%' }))
    expect(await screen.findByText("Skip: you'd need more than 44% extra orders")).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Your guess of extra orders/), { target: { value: '50' } })
    expect(await screen.findByText('Join')).toBeTruthy()
  })

  it('a product already losing money: fix the price first', async () => {
    const p = await seed({ price: 260 })
    renderApp(`/products/${p.id}/sale`)
    expect(await screen.findByText('Fix the price before joining any sale.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Price helper' })).toBeTruthy()
  })

  it('rejects a discount of 0 or 100%', async () => {
    const p = await seed()
    renderApp(`/products/${p.id}/sale`)
    const input = await screen.findByLabelText('Or type a discount (%)')
    await act(async () => {
      fireEvent.change(input, { target: { value: '100' } })
    })
    expect(await screen.findByText('Enter a discount between 1 and 99%.')).toBeTruthy()
  })
})
