// @vitest-environment jsdom
/**
 * Phase A flows in a real DOM: landing, onboarding with back, add product
 * with validation, "Discard changes?", leak finder, delete + undo, shop
 * setup recompute, language persistence. Same route tree as the app, in a
 * memory router, on a fake IndexedDB.
 */
import 'fake-indexeddb/auto'
import './domShim'

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '../../src/app/db'
import { addProduct, saveShop, type ProductInput } from '../../src/app/repo'
import { routes } from '../../src/app/routes'
import { I18nProvider } from '../../src/i18n'

function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>,
  )
  return router
}

async function onboarded(patch = {}) {
  await saveShop({ language: 'en', onboardedAt: 1, ...patch })
}

const kurti: ProductInput = { name: 'Blue kurti', category: 'ethnic_women', cost: 150, weightG: 350, price: 300 }

beforeEach(async () => {
  window.scrollTo = vi.fn() as never
  localStorage.clear()
  await db.delete()
  await db.open()
})

afterEach(() => {
  cleanup()
})

const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement

describe('landing (7.1)', () => {
  it('shows the headline, both ways in, the labelled example and the independence footer', async () => {
    renderApp('/')
    expect(await screen.findByRole('heading', { name: /Most sellers price on profit they never see/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Upload my Meesho report' }).getAttribute('href')).toBe('/start/language?next=upload')
    expect(screen.getByRole('link', { name: 'Type in one product' }).getAttribute('href')).toBe('/start/language?next=product')
    expect(screen.getByRole('link', { name: 'Try with a sample report' }).getAttribute('href')).toBe('/start/language?next=sample')
    expect(screen.getByText('Example with typical rates')).toBeTruthy()
    expect(screen.getByText('Independent tool. Not affiliated with Meesho.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Contact' }).getAttribute('href')).toBe('mailto:TEAM_EMAIL_HERE')
    // Social proof stays hidden until ≥ 10 activated sellers.
    expect(screen.queryByText(/sellers ·/)).toBeNull()
  })

  it('sends a returning seller straight to home', async () => {
    await onboarded()
    const router = renderApp('/')
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'))
  })

  it('sends anyone not set up yet from /home to onboarding', async () => {
    const router = renderApp('/home')
    await waitFor(() => expect(router.state.location.pathname).toBe('/start/language'))
  })
})

describe('onboarding (7.2) and its back flow (8.2)', () => {
  it('saves every answer, keeps them on back, and lands on the product form', async () => {
    const router = renderApp('/start/language?next=product')

    fireEvent.click(await screen.findByRole('button', { name: 'हिंदी' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/start/shop'))
    // The whole app switched to Hindi.
    expect(await screen.findByRole('heading', { name: 'आपकी दुकान के बारे में' })).toBeTruthy()
    expect(document.documentElement.lang).toBe('hi')

    fireEvent.click(screen.getByRole('radio', { name: 'छोटे शहर और कस्बे' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'क्या आप GST में रजिस्टर्ड हैं?' })).getByRole('radio', { name: 'नहीं' }))
    await waitFor(async () => expect((await db.shop.get('main'))?.buyerRegion).toBe('small_towns'))

    // Back to step 1 and forward again: the answers are still there.
    fireEvent.click(screen.getByRole('button', { name: /पीछे/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/start/language'))
    await act(() => router.navigate(1))
    const smallTowns = (await screen.findByRole('radio', { name: 'छोटे शहर और कस्बे' })) as HTMLInputElement
    expect(smallTowns.checked).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'आगे' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/products/new'))
    const shop = await db.shop.get('main')
    expect(shop).toMatchObject({ language: 'hi', buyerRegion: 'small_towns', gstRegistered: false })
    expect(shop!.onboardedAt).toBeGreaterThan(0)
  })

  it('after the first product is saved, Back goes home, never into the setup steps (8.2)', async () => {
    const router = renderApp('/start/language?next=product')
    fireEvent.click(await screen.findByRole('button', { name: 'English' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/start/shop'))
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/products/new'))

    fireEvent.change(await screen.findByLabelText(/Product name/), { target: { value: 'Blue kurti' } })
    fireEvent.change(field(/Product cost/), { target: { value: '150' } })
    fireEvent.change(field(/Packed weight/), { target: { value: '350' } })
    fireEvent.change(field(/Current price/), { target: { value: '300' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }))
    expect(await screen.findByText('At ₹300 you keep ₹30 per sale')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Back/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'))
    // And the setup steps behind it are replaced by home as well.
    await act(() => router.navigate(-1))
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'))
  })

  it('"Other" asks which GST rate is in the price', async () => {
    const router = renderApp('/start/shop')
    fireEvent.click(await screen.findByRole('radio', { name: 'Other' }))
    const rate = await screen.findByRole('group', { name: 'Which GST rate is inside your price?' })
    fireEvent.click(within(rate).getByRole('radio', { name: '5%' }))
    await waitFor(async () => expect(await db.shop.get('main')).toMatchObject({ category: 'other', gstRate: 0.05 }))
    expect(router.state.location.pathname).toBe('/start/shop')
  })

  it('without a ?next, step 3 offers upload / type one product / skip', async () => {
    await saveShop({ language: 'en' })
    const router = renderApp('/start/shop')
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/start/choose'))
    expect(screen.getByRole('link', { name: /Upload my Meesho report/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Type in one product/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Skip to home' }).getAttribute('href')).toBe('/home')
  })
})

describe('add product by hand (7.4)', () => {
  beforeEach(() => onboarded())

  it('keeps Save disabled until the 4 fields are valid, with inline errors (Section 15, negative 1: cost 0 → cannot save)', async () => {
    renderApp('/products/new')
    const save = (await screen.findByRole('button', { name: 'Save product' })) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    expect(screen.getByText('Fill in name, cost, weight and price to save.')).toBeTruthy()

    fireEvent.change(field(/Packed weight/), { target: { value: '40' } })
    fireEvent.blur(field(/Packed weight/))
    expect(await screen.findByText('Between 50 and 10,000 g')).toBeTruthy()

    fireEvent.change(field(/Product cost/), { target: { value: '0' } })
    expect(await screen.findByText('Must be more than 0')).toBeTruthy()

    fireEvent.change(field(/Product name/), { target: { value: 'Blue kurti' } })
    fireEvent.change(field(/Product cost/), { target: { value: '150' } })
    fireEvent.change(field(/Packed weight/), { target: { value: '350' } })
    fireEvent.change(field(/Current price/), { target: { value: '300' } })
    await waitFor(() => expect(save.disabled).toBe(false))
  })

  it('cost ≥ price saves with a red warning, then shows the loss (Section 15, negative 2)', async () => {
    const router = renderApp('/products/new')
    fireEvent.change(await screen.findByLabelText(/Product name/), { target: { value: 'Costly kurti' } })
    fireEvent.change(field(/Product cost/), { target: { value: '320' } })
    fireEvent.change(field(/Packed weight/), { target: { value: '350' } })
    fireEvent.change(field(/Current price/), { target: { value: '300' } })
    expect((await screen.findByRole('alert')).textContent).toMatch(/every sale loses money/)

    fireEvent.click(screen.getByRole('button', { name: 'Save product' }))
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/products\/[^/]+$/))
    expect(await screen.findByText(/At ₹300 you lose ₹\d+ per sale/)).toBeTruthy()
    expect(await db.products.count()).toBe(1)
  })

  it('"When did you list it?" is optional: blank saves no date (Steady); "Just now" saves today (Launch)', async () => {
    const fill = async (name: string) => {
      fireEvent.change(await screen.findByLabelText(/Product name/), { target: { value: name } })
      fireEvent.change(field(/Product cost/), { target: { value: '150' } })
      fireEvent.change(field(/Packed weight/), { target: { value: '350' } })
      fireEvent.change(field(/Current price/), { target: { value: '300' } })
    }
    const router = renderApp('/products/new')
    expect(await screen.findByRole('group', { name: /When did you list it\?/ })).toBeTruthy()
    await fill('Old kurti')
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }))
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/products\/[^/]+$/))
    expect((await db.products.toArray())[0]!.listedSince).toBeUndefined()
    expect(await screen.findByText('At ₹300 you keep ₹30 per sale')).toBeTruthy()

    await act(() => router.navigate('/products/new'))
    await fill('New kurti')
    fireEvent.click(screen.getByRole('radio', { name: 'Just now' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }))
    await waitFor(async () => expect(await db.products.count()).toBe(2))
    const fresh = (await db.products.toArray()).find((p) => p.name === 'New kurti')!
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(fresh.listedSince).toBe(today)
  })

  it('shows the estimate each blank optional field will use', async () => {
    renderApp('/products/new')
    fireEvent.click(await screen.findByRole('button', { name: /More details/ }))
    fireEvent.change(field(/Packed weight/), { target: { value: '350' } })
    expect(await screen.findByText(/We'll use ₹59 · Typical for a 350 g parcel/)).toBeTruthy()
    expect(screen.getByText(/We'll use ₹0 · Ads not included/)).toBeTruthy()
    expect(screen.getAllByText('Estimated').length).toBeGreaterThanOrEqual(4)
  })

  it('Back with changes asks "Discard changes?" (8.2)', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/home', '/products/new'], initialIndex: 1 })
    render(
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>,
    )
    fireEvent.change(await screen.findByLabelText(/Product name/), { target: { value: 'Half typed' } })

    await act(() => router.navigate(-1))
    expect(await screen.findByRole('alertdialog', { name: 'Discard changes?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(router.state.location.pathname).toBe('/products/new')
    expect(field(/Product name/).value).toBe('Half typed')

    await act(() => router.navigate(-1))
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'))
    expect(await db.products.count()).toBe(0)
  })

  it('Back with no changes just goes back', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/home', '/products/new'], initialIndex: 1 })
    render(
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>,
    )
    fireEvent.click(await screen.findByRole('button', { name: /Back/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})

describe('home: profit leak finder (7.5)', () => {
  it('empty state offers upload or add', async () => {
    await onboarded()
    renderApp('/home')
    expect(await screen.findByRole('heading', { name: 'No products yet' })).toBeTruthy()
    const main = within(screen.getByRole('main'))
    expect(main.getByRole('link', { name: 'Upload my Meesho report' })).toBeTruthy()
    expect(main.getByRole('link', { name: 'Add a product' })).toBeTruthy()
  })

  it('ranks worst first and totals the monthly loss', async () => {
    await onboarded()
    await addProduct({ ...kurti, name: 'Healthy kurti', price: 400, ordersPerWeek: 10 })
    await addProduct({ ...kurti, name: 'Losing kurti', price: 240, ordersPerWeek: 50 })
    await addProduct({ ...kurti, name: 'Also losing', price: 260, ordersPerWeek: 5 })
    renderApp('/home')
    expect(await screen.findByText(/2 products are costing you about ₹[\d,]+ a month/)).toBeTruthy()
    const names = screen.getAllByRole('listitem').map((li) => li.querySelector('p')?.textContent)
    expect(names.filter((n) => n?.includes('kurti') || n?.includes('losing'))).toEqual(['Losing kurti', 'Also losing', 'Healthy kurti'])

    fireEvent.click(screen.getByRole('button', { name: 'Losing' }))
    await waitFor(() => expect(screen.queryByText('Healthy kurti')).toBeNull())
  })

  it('hides the top card when no product has an order count', async () => {
    await onboarded()
    await addProduct(kurti)
    renderApp('/home')
    expect(await screen.findByText('Blue kurti')).toBeTruthy()
    expect(screen.queryByText(/costing you/)).toBeNull()
  })
})

describe('product detail: delete with undo (8.2)', () => {
  it('restores the product when Undo is tapped', async () => {
    await onboarded()
    const p = await addProduct(kurti)
    const router = createMemoryRouter(routes, { initialEntries: ['/home', `/products/${p.id}`], initialIndex: 1 })
    render(
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>,
    )
    expect(await screen.findByText('At ₹300 you keep ₹30 per sale')).toBeTruthy()
    expect(screen.getByText('Your floor: ₹269. Below this, every sale loses money.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'))
    expect(await db.products.count()).toBe(0)
    expect(await screen.findByText('“Blue kurti” deleted')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect(await db.products.get(p.id)).toBeTruthy())
  })

  it('goes home after a delete, wherever the product was opened from', async () => {
    await onboarded()
    const p = await addProduct(kurti)
    const router = createMemoryRouter(routes, { initialEntries: ['/me', `/products/${p.id}`], initialIndex: 1 })
    render(
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'))
  })

  it('an "Other" product says its estimates need checking', async () => {
    await onboarded()
    const p = await addProduct({ ...kurti, category: 'other' })
    renderApp(`/products/${p.id}`)
    expect(await screen.findByText(/Other category: weight, packaging, returns and unsellable returns are rough guesses/)).toBeTruthy()
  })
})

describe('Me: shop setup and language (8.2)', () => {
  it('saving the shop setup recomputes products and says how many changed', async () => {
    await onboarded()
    await addProduct({ ...kurti, price: 270 }) // Thin when registered, a Loss when not
    await addProduct({ ...kurti, price: 500 })
    renderApp('/me')
    const gst = await screen.findByRole('group', { name: 'Are you GST-registered?' })
    fireEvent.click(within(gst).getByRole('radio', { name: 'No' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save shop setup' }))
    expect(await screen.findByText('1 product changed status')).toBeTruthy()
    expect((await db.shop.get('main'))!.gstRegistered).toBe(false)
  })

  it('switches language instantly, keeps products, and remembers it after a reload', async () => {
    await onboarded()
    await addProduct(kurti)
    renderApp('/me')
    fireEvent.click((await screen.findAllByRole('button', { name: 'हिं' }))[0]!)
    expect(await screen.findByRole('heading', { name: 'मैं' })).toBeTruthy()
    await waitFor(async () => expect((await db.shop.get('main'))!.language).toBe('hi'))
    expect(await db.products.count()).toBe(1)

    cleanup()
    renderApp('/home')
    expect(await screen.findByRole('heading', { name: 'आपके प्रोडक्ट' })).toBeTruthy()
  })
})
