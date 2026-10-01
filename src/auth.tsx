import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { fees as defaultFees, type Fees } from './data'

/**
 * Prototype accounts, sellers' answers, and platform-wide defaults.
 *
 * ⚠ THIS IS NOT AUTHENTICATION. There is no server. Accounts live in this
 * browser's localStorage, the password is run through a non-cryptographic
 * digest, and anyone with the device can read or edit all of it. It exists so
 * the demo can show where a real seller's numbers would come from — their own
 * answers at signup and the platform defaults Meesho sets — instead of
 * hard-coding them. Every sign-in screen says so on the page.
 *
 * The point it makes is a product point, not a security one: the fields tagged
 * "Meesho ne bhara" on Screen 1 stop being invented. They come from what this
 * seller told us and what the admin configured.
 */

export type Role = 'seller' | 'admin'

/** Where a seller's buyers mostly are, which is what really drives COD share. */
export type BuyerMix = 'metro' | 'mixed' | 'small_town'

export interface SellerProfile {
  sellerName: string
  shopName: string
  /** What they mostly sell — picks the category defaults. */
  categoryId: string
  /** What one piece costs them. */
  typicalCogs: number
  /** What one packed parcel weighs. */
  typicalWeightG: number
  buyerMix: BuyerMix
  /** Offering a prepaid discount pulls the COD share down. */
  prepaidDiscount: boolean
  ordersPerWeek: number
  /** False until the questions have been answered. */
  completed: boolean
}

export interface Account {
  id: string
  email: string
  role: Role
  /** Non-cryptographic. See the warning above. */
  secret: string
  createdAt: string
  profile: SellerProfile | null
}

/** Platform-wide values an admin sets for every seller (spec section 5.1). */
export type PlatformDefaults = Pick<Fees, 'codFee' | 'gstRate' | 'rtoCod' | 'rtoPrepaid'>

export const PLATFORM_FALLBACK: PlatformDefaults = {
  codFee: defaultFees.codFee,
  gstRate: defaultFees.gstRate,
  rtoCod: defaultFees.rtoCod,
  rtoPrepaid: defaultFees.rtoPrepaid,
}

/** COD share by where the buyers are. The single biggest driver of RTO. */
export const COD_SHARE_BY_MIX: Record<BuyerMix, number> = {
  metro: 0.55,
  mixed: 0.8,
  small_town: 0.92,
}

/** A prepaid discount moves roughly a tenth of orders off COD. */
export const PREPAID_DISCOUNT_EFFECT = 0.1

export function codShareFor(profile: Pick<SellerProfile, 'buyerMix' | 'prepaidDiscount'>): number {
  const base = COD_SHARE_BY_MIX[profile.buyerMix]
  return Math.max(0, Math.round((base - (profile.prepaidDiscount ? PREPAID_DISCOUNT_EFFECT : 0)) * 100) / 100)
}

export function emptyProfile(): SellerProfile {
  return {
    sellerName: '',
    shopName: '',
    categoryId: 'ethnic_women',
    typicalCogs: 150,
    typicalWeightG: 350,
    buyerMix: 'mixed',
    prepaidDiscount: false,
    ordersPerWeek: 70,
    completed: false,
  }
}

// ------------------------------------------------------------------- storage

const ACCOUNTS_KEY = 'sahi-daam.accounts'
const SESSION_KEY = 'sahi-daam.session'
const PLATFORM_KEY = 'sahi-daam.platform'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    // Private windows, disabled storage, or corrupt JSON. Start clean rather
    // than crash the whole app on a storage read.
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable; the session simply will not survive a refresh */
  }
}

/** FNV-1a. Deliberately not a password hash — see the warning at the top. */
function digest(input: string): string {
  let h = 2166136261
  for (const ch of input) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

/** The account every demo starts from, so a judge never has to sign up first. */
export const DEMO_SELLER_EMAIL = 'ramesh@demo.in'
export const DEMO_ADMIN_EMAIL = 'admin@meesho.demo'
export const DEMO_PASSWORD = 'sahidaam'

function seedAccounts(): Account[] {
  return [
    {
      id: 'demo-seller',
      email: DEMO_SELLER_EMAIL,
      role: 'seller',
      secret: digest(DEMO_PASSWORD),
      createdAt: new Date(2026, 6, 6).toISOString(),
      profile: {
        sellerName: 'Ramesh',
        shopName: 'Ramesh Textiles',
        categoryId: 'ethnic_women',
        typicalCogs: 150,
        typicalWeightG: 350,
        buyerMix: 'mixed',
        prepaidDiscount: false,
        ordersPerWeek: 70,
        completed: true,
      },
    },
    {
      id: 'demo-admin',
      email: DEMO_ADMIN_EMAIL,
      role: 'admin',
      secret: digest(DEMO_PASSWORD),
      createdAt: new Date(2026, 6, 6).toISOString(),
      profile: null,
    },
  ]
}

// ------------------------------------------------------------------ provider

export interface AuthValue {
  account: Account | null
  accounts: Account[]
  platform: PlatformDefaults
  signIn: (email: string, password: string) => { ok: true } | { ok: false; error: string }
  signUp: (
    email: string,
    password: string,
    role: Role,
  ) => { ok: true } | { ok: false; error: string }
  signOut: () => void
  saveProfile: (profile: SellerProfile) => void
  savePlatform: (platform: PlatformDefaults) => void
  /** Wipes every prototype account back to the two demo logins. */
  resetEverything: () => void
}

const Context = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>(() => {
    const stored = readJson<Account[]>(ACCOUNTS_KEY, [])
    return stored.length > 0 ? stored : seedAccounts()
  })
  const [sessionId, setSessionId] = useState<string | null>(() =>
    readJson<string | null>(SESSION_KEY, null),
  )
  const [platform, setPlatform] = useState<PlatformDefaults>(() =>
    readJson<PlatformDefaults>(PLATFORM_KEY, PLATFORM_FALLBACK),
  )

  useEffect(() => writeJson(ACCOUNTS_KEY, accounts), [accounts])
  useEffect(() => writeJson(SESSION_KEY, sessionId), [sessionId])
  useEffect(() => writeJson(PLATFORM_KEY, platform), [platform])

  const value = useMemo<AuthValue>(() => {
    const account = accounts.find((a) => a.id === sessionId) ?? null

    return {
      account,
      accounts,
      platform,

      signIn(email, password) {
        const found = accounts.find((a) => a.email.toLowerCase() === email.trim().toLowerCase())
        if (!found) return { ok: false, error: 'auth.error.noAccount' }
        if (found.secret !== digest(password)) return { ok: false, error: 'auth.error.wrongPassword' }
        setSessionId(found.id)
        return { ok: true }
      },

      signUp(email, password, role) {
        const clean = email.trim().toLowerCase()
        if (!clean.includes('@')) return { ok: false, error: 'auth.error.badEmail' }
        if (password.length < 4) return { ok: false, error: 'auth.error.shortPassword' }
        if (accounts.some((a) => a.email.toLowerCase() === clean)) {
          return { ok: false, error: 'auth.error.taken' }
        }
        const created: Account = {
          id: `${role}-${Date.now().toString(36)}`,
          email: clean,
          role,
          secret: digest(password),
          createdAt: new Date().toISOString(),
          profile: role === 'seller' ? emptyProfile() : null,
        }
        setAccounts((list) => [...list, created])
        setSessionId(created.id)
        return { ok: true }
      },

      signOut() {
        setSessionId(null)
      },

      saveProfile(profile) {
        setAccounts((list) =>
          list.map((a) => (a.id === sessionId ? { ...a, profile: { ...profile, completed: true } } : a)),
        )
      },

      savePlatform(next) {
        setPlatform(next)
      },

      resetEverything() {
        const fresh = seedAccounts()
        setAccounts(fresh)
        setPlatform(PLATFORM_FALLBACK)
        setSessionId(null)
      },
    }
  }, [accounts, sessionId, platform])

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(Context)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
