import type { SupabaseClient } from '@supabase/supabase-js'

import {
  classifyCloudDeckFailure,
  type CloudDeckFailure,
} from './cloudDeckRepository'
import { deckVersionContentEquals } from '../domain/deckVersions/equality'
import {
  isDeckVersion,
  type DeckVersion,
  type DeckVersionId,
} from '../domain/deckVersions/types'
import { getSupabaseClient } from '../lib/supabaseClient'

export type CloudDeckVersionRecord = {
  version: DeckVersion
  deletedAt: string | null
}

export type CloudDeckVersionFailure = CloudDeckFailure | 'integrity-conflict'

export type CloudDeckVersionResult<T> =
  { ok: true; value: T } | { ok: false; reason: CloudDeckVersionFailure }

export type CloudDeckVersionRepository = {
  /** Every row owned by the account, including tombstones. */
  listAll: () => Promise<CloudDeckVersionResult<CloudDeckVersionRecord[]>>
  /** Inserts an immutable version. It never updates or resurrects an id. */
  insert: (
    version: DeckVersion,
  ) => Promise<CloudDeckVersionResult<CloudDeckVersionRecord>>
  /** Missing is success: the requested deleted state already holds. */
  tombstone: (
    versionId: DeckVersionId,
  ) => Promise<CloudDeckVersionResult<CloudDeckVersionRecord | null>>
}

const ROW_COLUMNS = 'id,deck_id,label,snapshot,created_at,deleted_at'
const SERVER_NOW = 'now'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isServerTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

export function toCloudDeckVersionRecord(
  value: unknown,
): CloudDeckVersionRecord | undefined {
  if (!isRecord(value)) return undefined
  const version: DeckVersion = {
    id: value.id as string,
    deckId: value.deck_id as string,
    label: value.label as string,
    createdAt: value.created_at as string,
    snapshot: value.snapshot as DeckVersion['snapshot'],
  }
  if (!isDeckVersion(version)) return undefined
  if (value.deleted_at !== null && !isServerTimestamp(value.deleted_at)) {
    return undefined
  }
  return {
    version,
    deletedAt: (value.deleted_at as string | null) ?? null,
  }
}

function toRecords(value: unknown): CloudDeckVersionRecord[] | undefined {
  if (!Array.isArray(value)) return undefined
  const records: CloudDeckVersionRecord[] = []
  for (const row of value) {
    const record = toCloudDeckVersionRecord(row)
    if (!record) return undefined
    records.push(record)
  }
  return records
}

export function createSupabaseCloudDeckVersionRepository(
  client: SupabaseClient | null = getSupabaseClient(),
): CloudDeckVersionRepository | null {
  if (!client) return null

  const hasSession = async (): Promise<boolean> => {
    const { data } = await client.auth.getSession()
    return Boolean(data.session)
  }

  const listById = async (
    versionId: string,
  ): Promise<CloudDeckVersionResult<CloudDeckVersionRecord | null>> => {
    try {
      const { data, error } = await client
        .from('deck_versions')
        .select(ROW_COLUMNS)
        .eq('id', versionId)
      if (error) {
        return { ok: false, reason: classifyCloudDeckFailure(error) }
      }
      const records = toRecords(data)
      if (!records) return { ok: false, reason: 'invalid-data' }
      if (records.length > 1) return { ok: false, reason: 'invalid-data' }
      return { ok: true, value: records[0] ?? null }
    } catch {
      return { ok: false, reason: 'network' }
    }
  }

  return {
    async listAll() {
      if (!(await hasSession())) {
        return { ok: false, reason: 'unauthenticated' }
      }
      try {
        const { data, error } = await client
          .from('deck_versions')
          .select(ROW_COLUMNS)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
        if (error) {
          return { ok: false, reason: classifyCloudDeckFailure(error) }
        }
        const records = toRecords(data)
        return records
          ? { ok: true, value: records }
          : { ok: false, reason: 'invalid-data' }
      } catch {
        return { ok: false, reason: 'network' }
      }
    },

    async insert(version) {
      if (!isDeckVersion(version)) {
        return { ok: false, reason: 'invalid-data' }
      }
      if (!(await hasSession())) {
        return { ok: false, reason: 'unauthenticated' }
      }
      try {
        const { data, error } = await client
          .from('deck_versions')
          .insert({
            id: version.id,
            deck_id: version.deckId,
            label: version.label,
            snapshot: version.snapshot,
            created_at: version.createdAt,
          })
          .select(ROW_COLUMNS)

        if (!error) {
          const records = toRecords(data)
          return records?.length === 1
            ? { ok: true, value: records[0] }
            : { ok: false, reason: 'invalid-data' }
        }

        if (error.code !== '23505') {
          return { ok: false, reason: classifyCloudDeckFailure(error) }
        }

        // INSERT, never UPSERT. A duplicate is read and compared so neither an
        // immutable payload nor a tombstone can be overwritten accidentally.
        const existing = await listById(version.id)
        if (!existing.ok) return existing
        if (!existing.value) return { ok: false, reason: 'failed' }
        if (existing.value.deletedAt !== null) {
          return { ok: true, value: existing.value }
        }
        return deckVersionContentEquals(existing.value.version, version)
          ? { ok: true, value: existing.value }
          : { ok: false, reason: 'integrity-conflict' }
      } catch {
        return { ok: false, reason: 'network' }
      }
    },

    async tombstone(versionId) {
      if (!versionId) return { ok: false, reason: 'invalid-data' }
      if (!(await hasSession())) {
        return { ok: false, reason: 'unauthenticated' }
      }
      try {
        const { data, error } = await client
          .from('deck_versions')
          .update({ deleted_at: SERVER_NOW })
          .eq('id', versionId)
          .select(ROW_COLUMNS)
        if (error) {
          return { ok: false, reason: classifyCloudDeckFailure(error) }
        }
        const records = toRecords(data)
        if (!records || records.length > 1) {
          return { ok: false, reason: 'invalid-data' }
        }
        return { ok: true, value: records[0] ?? null }
      } catch {
        return { ok: false, reason: 'network' }
      }
    },
  }
}
