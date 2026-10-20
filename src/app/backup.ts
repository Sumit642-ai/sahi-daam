/**
 * Backup, restore and delete everything (spec v2, 7.11 and section 9).
 *
 * A backup is one JSON file of the seller's own data, downloaded to the
 * phone. Restore replaces what's here with what's in the file. The send
 * queue and the anonymous device id are not part of a backup.
 */
import type { SahiDaamDb } from './db'
import { db as appDb } from './db'

export const BACKUP_APP = 'sahi-daam'

/** The seller's data. kv keeps only the referral codes; the device id and team flag stay with the device. */
const TABLES = ['shop', 'products', 'priceHistory', 'competitor', 'reports', 'mappings', 'skuStats', 'checks', 'priceSteps'] as const
const KV_IN_BACKUP = ['refCode', 'referredBy', 'lastBackupAt']

export interface Backup {
  app: typeof BACKUP_APP
  schema: number
  exportedAt: string
  tables: Record<(typeof TABLES)[number] | 'kv', unknown[]>
}

export async function exportBackup(db: SahiDaamDb = appDb, now = new Date()): Promise<Backup> {
  await db.kv.put({ key: 'lastBackupAt', value: now.getTime() })
  const tables = {} as Backup['tables']
  for (const t of TABLES) tables[t] = await db.table(t).toArray()
  tables.kv = (await db.kv.toArray()).filter((r) => KV_IN_BACKUP.includes(r.key))
  return { app: BACKUP_APP, schema: db.verno, exportedAt: now.toISOString(), tables }
}

export function backupFileName(now = new Date()): string {
  return `sahi-daam-backup-${now.toISOString().slice(0, 10)}.json`
}

export type RestoreError = 'notBackup' | 'newerSchema'

/** Checks a file is one of our backups before anything is touched. */
export function parseBackup(text: string, currentSchema: number): Backup | RestoreError {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return 'notBackup'
  }
  const b = data as Partial<Backup>
  if (!b || b.app !== BACKUP_APP || typeof b.schema !== 'number' || !b.tables || typeof b.tables !== 'object') return 'notBackup'
  if (b.schema > currentSchema) return 'newerSchema'
  for (const t of TABLES) if (b.tables[t] !== undefined && !Array.isArray(b.tables[t])) return 'notBackup'
  return b as Backup
}

/** Replaces the seller's data with the backup's, in one transaction. */
export async function restoreBackup(backup: Backup, db: SahiDaamDb = appDb): Promise<void> {
  const tables = [...TABLES.map((t) => db.table(t)), db.kv]
  await db.transaction('rw', tables, async () => {
    for (const t of TABLES) {
      await db.table(t).clear()
      const rows = backup.tables[t] ?? []
      if (rows.length > 0) await db.table(t).bulkPut(rows)
    }
    for (const row of (backup.tables.kv ?? []) as { key: string; value: unknown }[]) {
      if (KV_IN_BACKUP.includes(row.key)) await db.kv.put(row)
    }
  })
}

/** Delete everything (spec 7.11): every table, and this app's local storage keys. */
export async function deleteEverything(db: SahiDaamDb = appDb): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear()
  })
  try {
    for (const key of Object.keys(globalThis.localStorage ?? {})) if (key.startsWith('sahi-daam')) localStorage.removeItem(key)
  } catch {
    // Storage blocked: nothing stored there anyway.
  }
}
