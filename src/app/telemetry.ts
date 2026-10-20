/**
 * Anonymous counters, referral codes, team exclusion, and the send queue
 * (MVP spec v2, section 10).
 *
 *   - Events carry a random device id, a name, and at most a few numbers
 *     (never product names, prices, costs or ids).
 *   - Opening the app once with ?team=1 tags this device; its events are
 *     sent tagged and /stats leaves them out.
 *   - Opening with ?ref=CODE remembers who referred this device; finishing
 *     onboarding then counts one referral sign-up.
 *   - At most 200 events per device per day leave the phone (the database
 *     enforces the same limit).
 *   - Everything waits in the outbox until the phone is online and a backend
 *     is configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Without
 *     them nothing is ever sent, and the app works the same.
 *
 * The anon key is public by design; Supabase row-level security only lets
 * it insert. Reading totals needs the /stats key, checked inside a database
 * function (supabase/migrations), never stored in this code.
 */
import { type OutboxRow, type SahiDaamDb, db as appDb, newId } from './db'

export type EventName =
  | 'onboarding_done'
  | 'activated'
  | 'report_uploaded'
  | 'product_added'
  | 'leak_found'
  | 'price_applied'
  | 'sale_check_used'
  | 'share_clicked'
  | 'referral_signup'
  | 'pro_waitlist_joined'

/** Counted at most once per device, ever. */
const ONCE: EventName[] = ['onboarding_done', 'activated', 'referral_signup']
/** Counted at most once per device per day. */
const DAILY: EventName[] = ['leak_found', 'sale_check_used']

export const DAILY_EVENT_CAP = 200

export interface BackendConfig {
  url: string
  anonKey: string
}

export function backendConfig(): BackendConfig | null {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {}
  const url = env.VITE_SUPABASE_URL?.trim()
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim()
  return url && anonKey ? { url: url.replace(/\/+$/, ''), anonKey } : null
}

// ------------------------------------------------------------------ kv

export async function getKv<T>(key: string, db: SahiDaamDb = appDb): Promise<T | undefined> {
  return (await db.kv.get(key))?.value as T | undefined
}

export async function setKv(key: string, value: unknown, db: SahiDaamDb = appDb): Promise<void> {
  await db.kv.put({ key, value })
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const REF_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/

function randomCode(n: number): string {
  const bytes = new Uint8Array(n)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('')
}

/** This device's anonymous id, created once. */
export async function anonId(db: SahiDaamDb = appDb): Promise<string> {
  const existing = await getKv<string>('anonId', db)
  if (existing) return existing
  const id = newId()
  await setKv('anonId', id, db)
  return id
}

/** This device's referral code, created once: 6 letters/digits without look-alikes (no O/0, I/1). */
export async function referralCode(db: SahiDaamDb = appDb): Promise<string> {
  const existing = await getKv<string>('refCode', db)
  if (existing) return existing
  const code = randomCode(6)
  await setKv('refCode', code, db)
  return code
}

/** Reads ?team=1 and ?ref=CODE once, on app start. */
export async function readLaunchParams(search: string, db: SahiDaamDb = appDb): Promise<void> {
  const params = new URLSearchParams(search)
  if (params.get('team') === '1') await setKv('team', true, db)
  const ref = params.get('ref')?.toUpperCase()
  if (ref && REF_PATTERN.test(ref) && !(await getKv('referredBy', db)) && ref !== (await getKv('refCode', db))) {
    await setKv('referredBy', ref, db)
  }
}

/** The link a seller shares: the app with their referral code (spec 7.10). */
export function shareUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/?ref=${code}`
}

export function whatsappLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

// ---------------------------------------------------------------- events

type Props = Record<string, number | boolean | string>

/** Only small numbers, booleans and short codes survive: nothing that could carry product data. */
export function cleanProps(props: Props = {}): Props {
  const out: Props = {}
  for (const [k, v] of Object.entries(props)) {
    if (!/^[a-z_]{1,20}$/.test(k)) continue
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(v * 100) / 100
    else if (typeof v === 'boolean') out[k] = v
    else if (typeof v === 'string' && /^[A-Z0-9_]{1,16}$/.test(v)) out[k] = v
  }
  return out
}

const today = (now: number) => new Date(now).toISOString().slice(0, 10)

/** Queues one event (if the once / daily / cap rules allow) and tries to send. Never throws. */
export async function track(name: EventName, props: Props = {}, db: SahiDaamDb = appDb, now = Date.now()): Promise<boolean> {
  try {
    const day = today(now)
    if (ONCE.includes(name)) {
      if (await getKv(`once:${name}`, db)) return false
      await setKv(`once:${name}`, true, db)
    }
    if (DAILY.includes(name)) {
      if ((await getKv(`daily:${name}`, db)) === day) return false
      await setKv(`daily:${name}`, day, db)
    }
    const count = (await getKv<{ day: string; n: number }>('eventCount', db)) ?? { day, n: 0 }
    const n = count.day === day ? count.n : 0
    if (n >= DAILY_EVENT_CAP) return false
    await setKv('eventCount', { day, n: n + 1 }, db)

    await db.outbox.add({
      id: newId(),
      kind: 'event',
      payload: {
        anon_id: await anonId(db),
        name,
        props: cleanProps(props),
        team: (await getKv<boolean>('team', db)) === true,
      },
      at: now,
    })
    void flush(db)
    return true
  } catch {
    return false
  }
}

/** Waitlist, feedback and benchmark rows go through the same queue. */
export async function enqueue(kind: Exclude<OutboxRow['kind'], 'event'>, payload: Record<string, unknown>, db: SahiDaamDb = appDb): Promise<void> {
  await db.outbox.add({ id: newId(), kind, payload, at: Date.now() })
  void flush(db)
}

const TABLE: Record<OutboxRow['kind'], string> = {
  event: 'events',
  waitlist: 'waitlist',
  feedback: 'feedback',
  benchmark: 'benchmarks',
}

let flushing = false

/**
 * Sends what's queued. Sent rows (and rows the server refuses outright) are
 * removed; on a network error they stay for next time.
 */
export async function flush(
  db: SahiDaamDb = appDb,
  config: BackendConfig | null = backendConfig(),
  fetchFn: typeof fetch | undefined = globalThis.fetch,
): Promise<number> {
  if (!config || !fetchFn || flushing) return 0
  if (globalThis.navigator && 'onLine' in globalThis.navigator && !globalThis.navigator.onLine) return 0
  flushing = true
  let sent = 0
  try {
    const rows = await db.outbox.orderBy('at').limit(50).toArray()
    for (const kind of Object.keys(TABLE) as OutboxRow['kind'][]) {
      const batch = rows.filter((r) => r.kind === kind)
      if (batch.length === 0) continue
      const res = await fetchFn(`${config.url}/rest/v1/${TABLE[kind]}`, {
        method: 'POST',
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${config.anonKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(batch.map((r) => r.payload)),
      })
      // 2xx sent; 4xx refused for good (bad row, rate limit): drop. 5xx: keep and retry later.
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        await db.outbox.bulkDelete(batch.map((r) => r.id))
        if (res.ok) sent += batch.length
      }
    }
  } catch {
    // Offline or unreachable: keep the queue.
  } finally {
    flushing = false
  }
  return sent
}

export interface StatsDay {
  day: string
  activated: number
  reports: number
  products_checked: number
  products_losing: number
  referrals: number
  waitlist: number
}

export interface Stats {
  totals: Omit<StatsDay, 'day'>
  by_day: StatsDay[]
}

/** /stats: totals from the protected database function; the key comes from the URL, never from code. */
export async function fetchStats(
  key: string,
  config: BackendConfig | null = backendConfig(),
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<{ ok: true; stats: Stats } | { ok: false; reason: 'not_configured' | 'forbidden' | 'error' }> {
  if (!config) return { ok: false, reason: 'not_configured' }
  try {
    const res = await fetchFn(`${config.url}/rest/v1/rpc/sahi_daam_stats`, {
      method: 'POST',
      headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    })
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'forbidden' }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, reason: /forbidden|42501/.test(body) ? 'forbidden' : 'error' }
    }
    return { ok: true, stats: (await res.json()) as Stats }
  } catch {
    return { ok: false, reason: 'error' }
  }
}
