import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  COD_SHARE_BY_MIX,
  DEMO_PASSWORD,
  DEMO_SELLER_EMAIL,
  PREPAID_DISCOUNT_EFFECT,
  type SellerProfile,
  codShareFor,
  demoSellerProfile,
  emptyProfile,
} from '../src/auth'
import { AuthProvider } from '../src/auth'
import { defaultFloorInput, floorRange } from '../src/engine/floor'
import { I18nProvider } from '../src/i18n'
import { AdminConsole } from '../src/pages/AdminConsole'
import { SellerOnboarding } from '../src/pages/SellerOnboarding'
import { SignIn } from '../src/pages/SignIn'
import { inputsForProfile } from '../src/state/productInputs'
import { PLATFORM_FALLBACK } from '../src/auth'

/**
 * The signup answers exist to replace guesses with the seller's own numbers.
 * These tests check that they actually do, and that the sign-in screen says
 * plainly what it is.
 */

const page = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <I18nProvider>
      <AuthProvider>{node}</AuthProvider>
    </I18nProvider>,
  )

describe('the signup answers drive the auto-fill', () => {
  const base: SellerProfile = {
    ...emptyProfile(),
    sellerName: 'Sunita',
    shopName: 'Sunita Sarees',
    categoryId: 'ethnic_women',
    typicalCogs: 220,
    typicalWeightG: 700,
    buyerMix: 'small_town',
    prepaidDiscount: false,
    completed: true,
  }

  it('carries the seller’s own cost, weight and category through', () => {
    const inputs = inputsForProfile(base, PLATFORM_FALLBACK)
    expect(inputs.categoryId).toBe('ethnic_women')
    expect(inputs.cogs).toBe(220)
    expect(inputs.weightG).toBe(700)
  })

  it('turns "where do your buyers live" into a COD share', () => {
    expect(codShareFor({ buyerMix: 'metro', prepaidDiscount: false })).toBe(COD_SHARE_BY_MIX.metro)
    expect(codShareFor({ buyerMix: 'mixed', prepaidDiscount: false })).toBe(COD_SHARE_BY_MIX.mixed)
    expect(codShareFor({ buyerMix: 'small_town', prepaidDiscount: false })).toBe(
      COD_SHARE_BY_MIX.small_town,
    )
  })

  it('moves orders off COD when a prepaid discount is offered', () => {
    const without = codShareFor({ buyerMix: 'mixed', prepaidDiscount: false })
    const withIt = codShareFor({ buyerMix: 'mixed', prepaidDiscount: true })
    expect(without - withIt).toBeCloseTo(PREPAID_DISCOUNT_EFFECT, 6)
    expect(withIt).toBeGreaterThanOrEqual(0)
  })

  it('makes a small-town seller’s floor genuinely higher than a metro seller’s', () => {
    // The whole reason the question is worth asking: more COD means more
    // refusals at the door, which the seller pays for either way.
    const metro = inputsForProfile({ ...base, buyerMix: 'metro' }, PLATFORM_FALLBACK)
    const town = inputsForProfile({ ...base, buyerMix: 'small_town' }, PLATFORM_FALLBACK)
    const floorOf = (i: ReturnType<typeof inputsForProfile>) =>
      floorRange({
        cogs: i.cogs!,
        weightG: i.weightG!,
        categoryId: i.categoryId,
        codShare: i.codShare,
        rtoCod: i.rtoCod,
        rtoPrepaid: i.rtoPrepaid,
        returnRate: i.returnRateExpected,
        writeOffShare: i.writeOffShare,
        packagingCost: i.packagingCost!,
      }).expected

    expect(floorOf(town)).toBeGreaterThan(floorOf(metro))
  })

  it('passes the admin’s platform fees through to the seller', () => {
    const dearer = { ...PLATFORM_FALLBACK, rtoCod: 0.4 }
    const normal = inputsForProfile(base, PLATFORM_FALLBACK)
    const worse = inputsForProfile(base, dearer)
    expect(worse.rtoCod).toBe(0.4)
    expect(normal.rtoCod).toBe(PLATFORM_FALLBACK.rtoCod)
  })
})

describe('the sign-in screen', () => {
  const html = page(<SignIn />)

  it('leads with Enter as Ramesh, and has no admin shortcut', () => {
    expect(html).toContain('Sign in')
    expect(html).toContain('Sign up')
    expect(html).toContain('Enter as Ramesh')
    expect(html).not.toContain('Enter as admin')
    // The demo button comes before the form.
    expect(html.indexOf('Enter as Ramesh')).toBeLessThan(html.indexOf('type="email"'))
  })

  it('seeds Ramesh with no prepaid discount, so his COD share is 80%', () => {
    const ramesh = demoSellerProfile()
    expect(ramesh.prepaidDiscount).toBe(false)
    expect(codShareFor(ramesh)).toBe(0.8)
    const inputs = inputsForProfile(ramesh, PLATFORM_FALLBACK)
    const range = floorRange(
      { ...defaultFloorInput(inputs.categoryId), cogs: inputs.cogs!, weightG: inputs.weightG!, codShare: inputs.codShare },
    )
    expect(Math.round(range.expected)).toBe(318)
    expect(Math.round(range.low)).toBe(315)
    expect(Math.round(range.high)).toBe(362)
  })

  it('says plainly that it is not real authentication', () => {
    // The one thing on this prototype that could genuinely mislead someone.
    expect(html).toContain('Prototype sign-in')
    expect(html).toContain('no server')
    expect(html).toMatch(/not securely hashed/)
    expect(html).toMatch(/do not reuse a real password/i)
  })

  it('ships a demo login so a judge never has to sign up first', () => {
    expect(DEMO_SELLER_EMAIL).toContain('@')
    expect(DEMO_PASSWORD.length).toBeGreaterThanOrEqual(4)
  })
})

describe('the onboarding and admin screens render', () => {
  it('asks every question that feeds a field', () => {
    const html = page(<SellerOnboarding />)
    for (const question of [
      'What should we call you?',
      'What do you mostly sell?',
      'What does one piece cost you?',
      'What does one parcel weigh?',
      'Where do most of your buyers live?',
      'Do you offer a discount for paying up front?',
    ]) {
      expect(html).toContain(question)
    }
    // ...and shows the floor it is building as they answer.
    expect(html).toContain('Your floor, so far')
    expect(html).not.toMatch(/NaN|Infinity/)
  })

  it('shows the admin what a fee change would do to every seller', () => {
    const html = page(<AdminConsole onOpenAssumptions={() => {}} />)
    expect(html).toContain('Platform defaults')
    expect(html).toContain('COD handling fee')
    expect(html).toContain('Sellers on the platform')
    expect(html).toContain('Ramesh') // the seeded demo seller
    expect(html).not.toMatch(/NaN|Infinity/)
  })
})
