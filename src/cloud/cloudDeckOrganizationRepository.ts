import type { SupabaseClient } from '@supabase/supabase-js'

import type { DeckId } from '../domain/decks/types'
import type {
  DeckFolder,
  DeckFolderId,
  DeckOrganization,
  DeckTag,
  DeckTagId,
} from '../domain/deckOrganization/types'
import {
  canonicalizeTagIds,
  isDeckFolder,
  isDeckOrganization,
  isDeckTag,
} from '../domain/deckOrganization/validation'
import { getSupabaseClient } from '../lib/supabaseClient'
import { classifyCloudDeckFailure } from './cloudDeckRepository'

/**
 * Reading and writing the caller's own folders, tags and per-deck organization.
 *
 * Data access only: no cursor, no loop, no merging. Every method acts on the
 * signed-in account, and row level security is what enforces that, so there is
 * no userId parameter to get wrong.
 *
 * Two conversions live here and nowhere else in the app:
 *
 *   * The database says "no folder" with folder_id = null; the app says it by
 *     leaving the property off the object. A null that reached the app as a
 *     value would be a third spelling of the same fact.
 *   * tag_ids is stored as an array, whose order the table does not police, so
 *     everything read here is put back into the app's canonical order.
 */

/** A row of one of the three tables, once it has been checked. */
export type CloudDeckFolderRecord = {
  folder: DeckFolder
  /** Server clocks, describing when the row was synced. */
  createdAt: string
  updatedAt: string
  /** Set when the folder was removed; the row itself is kept as a tombstone. */
  deletedAt: string | null
}

export type CloudDeckTagRecord = {
  tag: DeckTag
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type CloudDeckOrganizationRecord = {
  organization: DeckOrganization
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/**
 * Kept separate from CloudDeckFailure rather than widening it.
 *
 * `missing-table` cannot happen for decks, whose table has been deployed since
 * Cloud Sync existed, and adding it there would make every deck-side caller
 * answer a case it can never see.
 */
export type CloudDeckOrganizationFailure =
  | 'network'
  | 'unauthenticated'
  | 'forbidden'
  | 'invalid-data'
  | 'not-found'
  | 'failed'
  /**
   * The account's schema does not have these tables yet. Not a failure the
   * reporter can do anything about, and not a reason to keep an unsent change:
   * there is nowhere for it to go until the migration is applied.
   */
  | 'missing-table'

export type CloudDeckOrganizationResult<T> =
  { ok: true; value: T } | { ok: false; reason: CloudDeckOrganizationFailure }

/** What one conditional definition write did. */
export type CloudDefinitionWriteOutcome = {
  written: boolean
  /**
   * True when the account holds this folder or tag as a tombstone, so the write
   * was deliberately skipped. The caller treats it as settled: retrying can
   * never succeed, and a deleted definition must stay deleted.
   */
  skippedTombstone: boolean
}

export type CloudDeckOrganizationRepository = {
  /** Every row this account owns, tombstones included. */
  listFolders: () => Promise<
    CloudDeckOrganizationResult<CloudDeckFolderRecord[]>
  >
  listTags: () => Promise<CloudDeckOrganizationResult<CloudDeckTagRecord[]>>
  listOrganizations: () => Promise<
    CloudDeckOrganizationResult<CloudDeckOrganizationRecord[]>
  >
  /**
   * Stores the folder unless the account holds it as a tombstone, in which case
   * nothing is written and the result says so. Never revives a deleted folder.
   */
  upsertFolder: (
    folder: DeckFolder,
  ) => Promise<CloudDeckOrganizationResult<CloudDefinitionWriteOutcome>>
  upsertTag: (
    tag: DeckTag,
  ) => Promise<CloudDeckOrganizationResult<CloudDefinitionWriteOutcome>>
  /**
   * Stores the organization, resurrecting it if it was a tombstone. Unlike a
   * folder, the row says what the device holds now, exactly as a deck does.
   */
  upsertOrganization: (
    organization: DeckOrganization,
  ) => Promise<CloudDeckOrganizationResult<CloudDeckOrganizationRecord>>
  /** Tombstones the folder and takes it off every deck that named it. */
  tombstoneFolder: (
    folderId: DeckFolderId,
  ) => Promise<CloudDeckOrganizationResult<{ organizationsCleared: number }>>
  tombstoneTag: (
    tagId: DeckTagId,
  ) => Promise<CloudDeckOrganizationResult<{ organizationsCleared: number }>>
  tombstoneOrganization: (
    deckId: DeckId,
  ) => Promise<CloudDeckOrganizationResult<CloudDeckOrganizationRecord>>
}

const FOLDER_COLUMNS = 'id,name,sort_order,created_at,updated_at,deleted_at'
const TAG_COLUMNS = 'id,name,created_at,updated_at,deleted_at'
const ORGANIZATION_COLUMNS =
  'deck_id,folder_id,tag_ids,created_at,updated_at,deleted_at'

/** As in the deck repository: the literal Postgres resolves to now(). */
const SERVER_NOW = 'now'

type SupabaseFailure = { code?: string; message?: string } | null

/**
 * The codes a Postgres or PostgREST instance without these tables returns.
 *
 * Deliberately a closed list. An unrecognised code falls through to the
 * ordinary failure path and the change stays queued, because losing a write the
 * reporter made is worse than a queue that has something in it.
 */
const MISSING_SCHEMA_CODES = new Set([
  // undefined_table and undefined_function, straight from Postgres.
  '42P01',
  '42883',
  // PostgREST could not find the function, or its schema cache has no such
  // relation.
  'PGRST202',
  'PGRST205',
])

export function classifyCloudDeckOrganizationFailure(
  error: SupabaseFailure,
): CloudDeckOrganizationFailure {
  if (error?.code && MISSING_SCHEMA_CODES.has(error.code)) {
    return 'missing-table'
  }
  return classifyCloudDeckFailure(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A timestamp as Postgres returns it. The app's own isIsoDateString is not
 * reused: it demands exactly milliseconds and a Z suffix, which timestamptz does
 * not produce, so it would reject every well formed row.
 */
function isServerTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

type SyncTimes = {
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

function toSyncTimes(value: Record<string, unknown>): SyncTimes | undefined {
  if (!isServerTimestamp(value.created_at)) return undefined
  if (!isServerTimestamp(value.updated_at)) return undefined
  if (value.deleted_at !== null && !isServerTimestamp(value.deleted_at)) {
    return undefined
  }
  return {
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    deletedAt: (value.deleted_at as string | null) ?? null,
  }
}

/**
 * Checks one row. A response is untrusted input like any other: the row may
 * predate a format change, and the app should not build a folder out of
 * whatever arrives.
 *
 * The folder's own createdAt and updatedAt are taken from the row's sync times,
 * because these tables keep one pair of columns for both meanings. That is why
 * reconciliation compares names rather than whole objects.
 */
export function toCloudDeckFolderRecord(
  value: unknown,
): CloudDeckFolderRecord | undefined {
  if (!isRecord(value)) return undefined
  const times = toSyncTimes(value)
  if (!times) return undefined
  const folder = {
    id: value.id,
    name: value.name,
    sortOrder: value.sort_order,
    createdAt: times.createdAt,
    updatedAt: times.updatedAt,
  }
  if (!isCloudFolderShape(folder)) return undefined
  return { folder, ...times }
}

/**
 * The stored values are checked with the app's own validator, except for the
 * timestamps, which are server values in a format the app's validator does not
 * accept. Substituting a placeholder for the check keeps the one rule about
 * names, ids and ordering in a single place.
 */
const VALIDATOR_TIMESTAMP = '2026-01-01T00:00:00.000Z'

function isCloudFolderShape(value: {
  id: unknown
  name: unknown
  sortOrder: unknown
  createdAt: string
  updatedAt: string
}): value is DeckFolder {
  return isDeckFolder({
    ...value,
    createdAt: VALIDATOR_TIMESTAMP,
    updatedAt: VALIDATOR_TIMESTAMP,
  })
}

export function toCloudDeckTagRecord(
  value: unknown,
): CloudDeckTagRecord | undefined {
  if (!isRecord(value)) return undefined
  const times = toSyncTimes(value)
  if (!times) return undefined
  const tag = {
    id: value.id,
    name: value.name,
    createdAt: times.createdAt,
    updatedAt: times.updatedAt,
  }
  if (
    !isDeckTag({
      ...tag,
      createdAt: VALIDATOR_TIMESTAMP,
      updatedAt: VALIDATOR_TIMESTAMP,
    })
  ) {
    return undefined
  }
  return { tag: tag as DeckTag, ...times }
}

export function toCloudDeckOrganizationRecord(
  value: unknown,
): CloudDeckOrganizationRecord | undefined {
  if (!isRecord(value)) return undefined
  const times = toSyncTimes(value)
  if (!times) return undefined
  if (typeof value.deck_id !== 'string' || !value.deck_id) return undefined
  if (value.folder_id !== null && typeof value.folder_id !== 'string') {
    return undefined
  }
  if (value.folder_id === '') return undefined
  if (!Array.isArray(value.tag_ids)) return undefined
  if (!value.tag_ids.every((id) => typeof id === 'string' && id)) {
    return undefined
  }

  const organization: DeckOrganization = {
    deckId: value.deck_id,
    // null becomes the absence of the property, which is the only way the app
    // spells "no folder".
    ...(value.folder_id === null ? {} : { folderId: value.folder_id }),
    // The table does not police the order, so it is restored here rather than
    // trusted.
    tagIds: canonicalizeTagIds(value.tag_ids as string[]),
    createdAt: times.createdAt,
    updatedAt: times.updatedAt,
  }
  if (
    !isDeckOrganization({
      ...organization,
      createdAt: VALIDATOR_TIMESTAMP,
      updatedAt: VALIDATOR_TIMESTAMP,
    })
  ) {
    return undefined
  }
  return { organization, ...times }
}

/**
 * All or nothing, matching how the local repository treats a bad row. A
 * silently short list would look like a deletion to a sync engine, which is the
 * worst possible way to fail.
 */
function toList<T>(
  value: unknown,
  convert: (row: unknown) => T | undefined,
): T[] | undefined {
  if (!Array.isArray(value)) return undefined
  const records: T[] = []
  for (const row of value) {
    const record = convert(row)
    if (!record) return undefined
    records.push(record)
  }
  return records
}

/** What the folder and tag upsert functions return, once checked. */
function toWriteOutcome(
  value: unknown,
): CloudDefinitionWriteOutcome | undefined {
  if (!Array.isArray(value) || value.length !== 1) return undefined
  const row = value[0]
  if (!isRecord(row)) return undefined
  if (
    typeof row.written !== 'boolean' ||
    typeof row.skipped_tombstone !== 'boolean'
  ) {
    return undefined
  }
  return { written: row.written, skippedTombstone: row.skipped_tombstone }
}

function toClearedCount(value: unknown, foundKey: string): number | undefined {
  if (!Array.isArray(value) || value.length !== 1) return undefined
  const row = value[0]
  if (!isRecord(row)) return undefined
  if (typeof row[foundKey] !== 'boolean') return undefined
  const cleared = row.organizations_cleared
  if (
    typeof cleared !== 'number' ||
    !Number.isInteger(cleared) ||
    cleared < 0
  ) {
    return undefined
  }
  // Whether the definition was still active is not reported upward: either way
  // the account now holds it as a tombstone, which is what was asked for.
  return cleared
}

/** Null when Cloud Sync is not configured, as the deck repository does. */
export function createSupabaseCloudDeckOrganizationRepository(
  client: SupabaseClient | null = getSupabaseClient(),
): CloudDeckOrganizationRepository | null {
  if (!client) return null

  /**
   * Reads the stored session rather than asking the server who the caller is,
   * for the same reason the deck repository does: a round trip before every
   * operation would fail while offline.
   */
  const hasSession = async (): Promise<boolean> => {
    const { data } = await client.auth.getSession()
    return Boolean(data.session)
  }

  const run = async <T>(
    build: () => PromiseLike<{ data: unknown; error: SupabaseFailure }>,
    convert: (data: unknown) => T | undefined,
    /**
     * How to word a statement that matched no row, where that is a fact about
     * the account rather than a malformed response.
     */
    emptyReason?: CloudDeckOrganizationFailure,
  ): Promise<CloudDeckOrganizationResult<T>> => {
    if (!(await hasSession())) return { ok: false, reason: 'unauthenticated' }
    try {
      const { data, error } = await build()
      if (error) {
        return {
          ok: false,
          reason: classifyCloudDeckOrganizationFailure(error),
        }
      }
      if (emptyReason && Array.isArray(data) && data.length === 0) {
        return { ok: false, reason: emptyReason }
      }
      const value = convert(data)
      return value === undefined
        ? { ok: false, reason: 'invalid-data' }
        : { ok: true, value }
    } catch {
      // Thrown rather than returned means the request never completed.
      return { ok: false, reason: 'network' }
    }
  }

  const listFrom = <T>(
    table: string,
    columns: string,
    order: string,
    convert: (row: unknown) => T | undefined,
  ) =>
    run(
      () =>
        client
          .from(table)
          .select(columns)
          // Ordered so a caller can resume deterministically. updated_at alone
          // is not a total order, because one transaction stamps every row it
          // writes identically, so the key breaks the tie.
          .order('updated_at', { ascending: true })
          .order(order, { ascending: true }),
      (data) => toList(data, convert),
    )

  return {
    listFolders() {
      return listFrom('deck_folders', FOLDER_COLUMNS, 'id', (row) =>
        toCloudDeckFolderRecord(row),
      )
    },

    listTags() {
      return listFrom('deck_tags', TAG_COLUMNS, 'id', (row) =>
        toCloudDeckTagRecord(row),
      )
    },

    listOrganizations() {
      return listFrom(
        'deck_organizations',
        ORGANIZATION_COLUMNS,
        'deck_id',
        (row) => toCloudDeckOrganizationRecord(row),
      )
    },

    upsertFolder(folder) {
      if (!isDeckFolder(folder)) {
        return Promise.resolve({ ok: false, reason: 'invalid-data' as const })
      }
      // Through the function rather than a plain upsert: a deleted folder must
      // stay deleted, and the client library cannot express the condition that
      // leaves a tombstoned row alone.
      return run(
        () =>
          client.rpc('upsert_deck_folder', {
            p_id: folder.id,
            p_name: folder.name,
            p_sort_order: folder.sortOrder,
          }),
        toWriteOutcome,
      )
    },

    upsertTag(tag) {
      if (!isDeckTag(tag)) {
        return Promise.resolve({ ok: false, reason: 'invalid-data' as const })
      }
      return run(
        () => client.rpc('upsert_deck_tag', { p_id: tag.id, p_name: tag.name }),
        toWriteOutcome,
      )
    },

    upsertOrganization(organization) {
      if (!isDeckOrganization(organization)) {
        return Promise.resolve({ ok: false, reason: 'invalid-data' as const })
      }
      return run(
        () =>
          client
            .from('deck_organizations')
            // user_id and the timestamps are left out: the first defaults to
            // auth.uid() and the others are set by the trigger, so a client
            // cannot claim another account's row or backdate its own.
            .upsert(
              {
                deck_id: organization.deckId,
                // The absence of the property becomes null, which is how the
                // table spells "no folder".
                folder_id: organization.folderId ?? null,
                tag_ids: [...organization.tagIds],
                deleted_at: null,
              },
              { onConflict: 'user_id,deck_id' },
            )
            .select(ORGANIZATION_COLUMNS),
        (data) =>
          Array.isArray(data) && data.length === 1
            ? toCloudDeckOrganizationRecord(data[0])
            : undefined,
      )
    },

    tombstoneFolder(folderId) {
      if (!folderId) {
        return Promise.resolve({ ok: false, reason: 'invalid-data' as const })
      }
      return run(
        () => client.rpc('tombstone_deck_folder', { p_folder_id: folderId }),
        (data) => {
          const cleared = toClearedCount(data, 'folder_found')
          return cleared === undefined
            ? undefined
            : { organizationsCleared: cleared }
        },
      )
    },

    tombstoneTag(tagId) {
      if (!tagId) {
        return Promise.resolve({ ok: false, reason: 'invalid-data' as const })
      }
      return run(
        () => client.rpc('tombstone_deck_tag', { p_tag_id: tagId }),
        (data) => {
          const cleared = toClearedCount(data, 'tag_found')
          return cleared === undefined
            ? undefined
            : { organizationsCleared: cleared }
        },
      )
    },

    tombstoneOrganization(deckId) {
      if (!deckId) {
        return Promise.resolve({ ok: false, reason: 'invalid-data' as const })
      }
      return run(
        () =>
          client
            .from('deck_organizations')
            .update({ deleted_at: SERVER_NOW })
            .eq('deck_id', deckId)
            .select(ORGANIZATION_COLUMNS),
        (data) =>
          Array.isArray(data)
            ? toCloudDeckOrganizationRecord(data[0])
            : undefined,
        // Row level security makes another account's row invisible rather than
        // forbidden, so nothing matching is indistinguishable from, and
        // reported as, an organization this account does not have.
        'not-found',
      )
    },
  }
}
