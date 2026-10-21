/**
 * The Supabase migration, run for real in PGlite (Postgres in WebAssembly):
 * insert-only access for the public key, the per-device rate limit, the
 * protected stats function, and team exclusion (Section 15, negative 12).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

// Every migration, in order, the way a project that ran each one when it shipped has them.
const MIGRATIONS = join(__dirname, '..', '..', 'supabase', 'migrations')
const SQL = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'))
  .join('\n')
const SECRET = 'test-secret-0123456789abcdef'

let pg: PGlite

/** Run as the public (anon) role, the way PostgREST does for the app's requests. */
async function asAnon<T>(fn: () => Promise<T>): Promise<T> {
  await pg.exec('set role anon')
  try {
    return await fn()
  } finally {
    await pg.exec('reset role')
  }
}

async function event(anon: string, name: string, props: object = {}, team = false) {
  await pg.query('insert into public.events (anon_id, name, props, team) values ($1, $2, $3, $4)', [anon, name, JSON.stringify(props), team])
}

async function stats(key: string) {
  const r = await pg.query<{ s: Record<string, unknown> }>('select public.sahi_daam_stats($1) as s', [key])
  return r.rows[0]!.s as { totals: Record<string, number>; by_day: Record<string, unknown>[] }
}

beforeAll(async () => {
  pg = new PGlite()
  // Supabase's roles.
  await pg.exec(`create role anon nologin; create role authenticated nologin; grant usage on schema public to anon, authenticated;`)
  await pg.exec(SQL)
  await pg.query(`insert into private.settings (name, value) values ('stats_key', $1)`, [SECRET])
}, 60_000)

describe('what the public key can do', () => {
  it('can insert events, waitlist, feedback and benchmark rows', async () => {
    await asAnon(async () => {
      await event('device-aaaa-0001', 'onboarding_done')
      await pg.query(`insert into public.waitlist (contact, consent, lang) values ('9800000000', true, 'hi')`)
      await pg.query(`insert into public.feedback (stars, text) values (5, 'useful')`)
      await pg.query(`insert into public.benchmarks (category, region, rto_pct, return_pct, avg_ship) values ('ethnic_women', 'mixed', 16.7, 16.0, 59)`)
    })
    expect((await pg.query('select count(*)::int as n from public.events')).rows[0]).toEqual({ n: 1 })
  })

  it('cannot read, change or delete anything', async () => {
    await asAnon(async () => {
      await expect(pg.query('select * from public.events')).rejects.toThrow(/permission denied/)
      await expect(pg.query('select * from public.waitlist')).rejects.toThrow(/permission denied/)
      await expect(pg.query('update public.events set team = true')).rejects.toThrow(/permission denied/)
      await expect(pg.query('delete from public.feedback')).rejects.toThrow(/permission denied/)
      await expect(pg.query('select * from private.settings')).rejects.toThrow(/permission denied/)
    })
  })

  it('cannot insert an unknown event name or oversized props', async () => {
    await asAnon(async () => {
      await expect(event('device-aaaa-0001', 'drop_table')).rejects.toThrow(/check constraint/)
      await expect(event('device-aaaa-0001', 'product_added', { x: 'y'.repeat(600) })).rejects.toThrow(/check constraint/)
    })
  })

  it('cannot join the waitlist without consent', async () => {
    await asAnon(async () => {
      await expect(pg.query(`insert into public.waitlist (contact, consent) values ('a@b.in', false)`)).rejects.toThrow(/check constraint/)
    })
  })
})

describe('rate limit: 200 events per device per day', () => {
  it('drops the 201st silently', async () => {
    const anon = 'device-flood-0001'
    await asAnon(async () => {
      for (let i = 0; i < 205; i++) await event(anon, 'share_clicked')
    })
    const r = await pg.query<{ n: number }>('select count(*)::int as n from public.events where anon_id = $1', [anon])
    expect(r.rows[0]!.n).toBe(200)
  })
})

describe('/stats through the protected function', () => {
  it('refuses a wrong or empty key', async () => {
    await asAnon(async () => {
      await expect(stats('wrong-key')).rejects.toThrow(/forbidden/)
      await expect(stats('')).rejects.toThrow(/forbidden/)
    })
  })

  it('counts activated sellers, reports, losses, referrals and the waitlist, without team devices (negative 12)', async () => {
    await asAnon(async () => {
      // Two real sellers.
      await event('seller-real-0001', 'activated')
      await event('seller-real-0001', 'report_uploaded', { products: 5 })
      await event('seller-real-0001', 'leak_found', { losing: 2 })
      await event('seller-real-0002', 'activated')
      await event('seller-real-0002', 'product_added', { products: 1 })
      await event('seller-real-0002', 'referral_signup', { ref: 'ABCDEF' })
      // A team device, tagged by ?team=1: must not count.
      await event('team-device-001', 'activated', {}, true)
      await event('team-device-001', 'report_uploaded', { products: 9 }, true)
      await event('team-device-001', 'leak_found', { losing: 7 }, true)
      await pg.query(`insert into public.waitlist (contact, consent, lang, team) values ('team@example.com', true, 'en', true)`)
      // The built-in sample report: not a real upload.
      await event('seller-real-0002', 'report_uploaded', { products: 5, sample: true })
    })
    const s = await asAnon(() => stats(SECRET))
    expect(s.totals).toMatchObject({
      activated: 2,
      reports: 1,
      products_checked: 6,
      products_losing: 2,
      referrals: 1,
      waitlist: 1,
    })
    expect(s.by_day).toHaveLength(1)
    expect(s.by_day[0]).toMatchObject({ activated: 2, reports: 1, waitlist: 1 })
  })
})
