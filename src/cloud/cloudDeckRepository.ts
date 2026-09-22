import type { SupabaseClient } from '@supabase/supabase-js'

import type { Deck } from '../domain/decks/types'
import { isDeck } from '../domain/decks/validation'
import { getSupabaseClient } from '../lib/supabaseClient'

/**
 * Reading and writing the caller's own rows in public.decks.
 *
 * This is the data access layer only. It holds no cursor, runs no loop and
 * decides nothing about merging: a later sync engine sits on top of these four
 * primitives. Nothing here touches public.deck_shares, which is a public
 * snapshot table with entirely different access rules.
 *
 * Every method acts on the signed in account and nothing else. There is no
 * userId parameter by design: the account comes from the session and row level
 * security is what enforces it, so a caller cannot ask for somebody else's
 * rows even by mistake.
 */

/** A row of public.decks, once it has been checked. */
export type CloudDeckRecord = {
  id: string
  deck: Deck
  /** Server clocks, describing when the row was synced. */
  createdAt: string
  updatedAt: string
  /** Set when the deck was removed; the row itself is kept as a tombstone. */
  deletedAt: string | null
}

export type CloudDeckFailure =
  /** No session, so there is nothing to read or write. */
  | 'unauthenticated'
  /** The request never completed. */
  | 'network'
  /** The server refused it, which for this table means row level security. */
  | 'forbidden'
  /** The row came back in a shape the app does not accept. */
  | 'invalid-data'
  /** Asked to tombstone a deck this account does not have. */
  | 'not-found'
  | 'failed'

export type CloudDeckResult<T> =
  { ok: true; value: T } | { ok: false; reason: CloudDeckFailure }

export type CloudDeckRepository = {
  /**
   * Every row this account owns, tombstones included.
   *
   * Deleted rows are deliberately not filtered out: a sync engine has to see a
   * deletion to apply it, and dropping them here would make that impossible
   * without a second query.
   */
  listAll: () => Promise<CloudDeckResult<CloudDeckRecord[]>>
  /**
   * Rows changed at or after the boundary, inclusive.
   *
   * Inclusive rather than exclusive because updated_at comes from now(), which
   * is the transaction timestamp: rows written by one transaction share it
   * exactly. An exclusive boundary would silently skip every row but one of
   * such a group. The cost is that the boundary row is fetched again, which a
   * caller absorbs by applying rows idempotently.
   */
  listUpdatedSince: (
    updatedAtInclusive: string,
  ) => Promise<CloudDeckResult<CloudDeckRecord[]>>
  /** Stores the deck, resurrecting it if it was a tombstone. */
  upsert: (deck: Deck) => Promise<CloudDeckResult<CloudDeckRecord>>
  /**
   * Marks the deck deleted. There is no physical delete: the account holds no
   * delete privilege, and a removed row could be resurrected by any device
   * still holding a copy.
   */
  tombstone: (deckId: string) => Promise<CloudDeckResult<CloudDeckRecord>>
}

/** The columns the app reads. user_id is deliberately not among them. */
const ROW_COLUMNS = 'id,deck,created_at,updated_at,deleted_at'

/**
 * Postgres resolves the literal 'now' to the transaction timestamp when it is
 * read as a timestamptz, so the deletion time is the server's clock and lands
 * on exactly the value the updated_at trigger writes. Sending a browser
 * timestamp instead would let a device with a wrong clock date its own
 * deletions, which is the thing the trigger already exists to prevent.
 *
 * The caveat in the Postgres manual is about DEFAULT expressions and views,
 * where 'now' would be frozen when the object is defined. Here it is a value
 * in a statement, evaluated when the statement runs.
 */
const SERVER_NOW = 'now'

type SupabaseFailure = { code?: string; message?: string } | null

/**
 * Sorts a PostgREST error into the cases a caller words differently. Pure, so
 * the mapping is testable without a server, and nothing from the database
 * reaches the UI.
 */
export function classifyCloudDeckFailure(
  error: SupabaseFailure,
): CloudDeckFailure {
  // 42501 is insufficient_privilege, which is what a row level security
  // refusal looks like from the API.
  if (error?.code === '42501') return 'forbidden'
  // PostgREST reports a missing, malformed or expired token this way.
  if (error?.code === 'PGRST301' || error?.code === '401') {
    return 'unauthenticated'
  }
  if (/fetch|network|timeout/i.test(error?.message ?? '')) return 'network'
  return 'failed'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A timestamp as Postgres returns it, such as
 * 2026-09-22T04:56:42.700791+00:00.
 *
 * The app's own isIsoDateString is deliberately not reused: it demands exactly
 * milliseconds and a Z suffix, which timestamptz does not produce, so it would
 * reject every well formed row. These are server values kept as given rather
 * than reformatted, so the deck's own createdAt and updatedAt stay the only
 * timestamps in the app's own format.
 */
function isServerTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

/**
 * Checks one row. A response is untrusted input like any other: the row may
 * predate a format change, and the app should not build a Deck out of whatever
 * arrives.
 */
export function toCloudDeckRecord(value: unknown): CloudDeckRecord | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.id !== 'string' || !value.id) return undefined
  // The stored payload is the app's own Deck, so the app's own validator is
  // what decides whether it is one.
  if (!isDeck(value.deck)) return undefined
  // The row key and the deck's own id are two spellings of one identity, and a
  // row where they disagree has no single answer to "which deck is this".
  // Restoring such a row locally would file it under the deck id while the
  // cloud keys it under the row id, so a later tombstone, resurrection or
  // repeated upsert would act on a different row than the one that came back.
  //
  // Neither side is corrected to match the other: silently rewriting an
  // identity is how the mismatch would spread instead of being noticed.
  if (value.deck.id !== value.id) return undefined
  if (!isServerTimestamp(value.created_at)) return undefined
  if (!isServerTimestamp(value.updated_at)) return undefined
  if (value.deleted_at !== null && !isServerTimestamp(value.deleted_at)) {
    return undefined
  }
  return {
    id: value.id,
    deck: value.deck,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    deletedAt: (value.deleted_at as string | null) ?? null,
  }
}

/**
 * All or nothing, matching how the local repository treats a bad row: it
 * throws rather than skipping one. A silently short list would look like a
 * deletion to a sync engine, which is the worst possible way to fail.
 */
function toRecords(value: unknown): CloudDeckRecord[] | undefined {
  if (!Array.isArray(value)) return undefined
  const records: CloudDeckRecord[] = []
  for (const row of value) {
    const record = toCloudDeckRecord(row)
    if (!record) return undefined
    records.push(record)
  }
  return records
}

/** Null when Cloud Sync is not configured, as AuthSource and DeckShareSource do. */
export function createSupabaseCloudDeckRepository(
  client: SupabaseClient | null = getSupabaseClient(),
): CloudDeckRepository | null {
  if (!client) return null

  /**
   * Reads the stored session rather than asking the server who the caller is.
   * getUser() would mean a network round trip before every operation and would
   * fail while offline, which is exactly what the session restore in the auth
   * layer avoids. Row level security, not this check, is the boundary; this
   * only turns a guaranteed refusal into a clear answer without a request.
   */
  const hasSession = async (): Promise<boolean> => {
    const { data } = await client.auth.getSession()
    return Boolean(data.session)
  }

  const query = () =>
    client
      .from('decks')
      .select(ROW_COLUMNS)
      // Ordered so a caller can page or resume deterministically. updated_at
      // alone is not a total order, because one transaction stamps every row
      // it writes identically, so id breaks the tie.
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })

  const listWith = async (
    build: () => PromiseLike<{ data: unknown; error: SupabaseFailure }>,
  ): Promise<CloudDeckResult<CloudDeckRecord[]>> => {
    if (!(await hasSession())) return { ok: false, reason: 'unauthenticated' }
    try {
      const { data, error } = await build()
      if (error) return { ok: false, reason: classifyCloudDeckFailure(error) }
      const records = toRecords(data)
      return records
        ? { ok: true, value: records }
        : { ok: false, reason: 'invalid-data' }
    } catch {
      // Thrown rather than returned means the request never completed.
      return { ok: false, reason: 'network' }
    }
  }

  const single = async (
    build: () => PromiseLike<{ data: unknown; error: SupabaseFailure }>,
    emptyReason: CloudDeckFailure,
  ): Promise<CloudDeckResult<CloudDeckRecord>> => {
    if (!(await hasSession())) return { ok: false, reason: 'unauthenticated' }
    try {
      const { data, error } = await build()
      if (error) return { ok: false, reason: classifyCloudDeckFailure(error) }
      if (!Array.isArray(data)) return { ok: false, reason: 'invalid-data' }
      if (data.length === 0) return { ok: false, reason: emptyReason }
      const record = toCloudDeckRecord(data[0])
      return record
        ? { ok: true, value: record }
        : { ok: false, reason: 'invalid-data' }
    } catch {
      return { ok: false, reason: 'network' }
    }
  }

  return {
    listAll() {
      // No user_id filter. Row level security already restricts the rows to
      // this account, and the repository has no independent idea of who that
      // is to filter by, so a filter would add a claim it cannot check.
      return listWith(() => query())
    },

    listUpdatedSince(updatedAtInclusive) {
      return listWith(() => query().gte('updated_at', updatedAtInclusive))
    },

    upsert(deck) {
      if (!isDeck(deck)) {
        return Promise.resolve({ ok: false, reason: 'invalid-data' as const })
      }
      return single(
        () =>
          client
            .from('decks')
            // user_id, created_at and updated_at are all left out: the first
            // defaults to auth.uid() and the other two are set by the trigger,
            // so a client cannot claim another account's row or backdate its
            // own. The conflict target still names user_id, which resolves
            // against the defaulted value.
            .upsert(
              { id: deck.id, deck, deleted_at: null },
              { onConflict: 'user_id,id' },
            )
            .select(ROW_COLUMNS),
        // An upsert that matched nothing means the write was refused rather
        // than that the deck is missing.
        'forbidden',
      )
    },

    tombstone(deckId) {
      if (!deckId) {
        return Promise.resolve({ ok: false, reason: 'invalid-data' as const })
      }
      return single(
        () =>
          client
            .from('decks')
            .update({ deleted_at: SERVER_NOW })
            .eq('id', deckId)
            .select(ROW_COLUMNS),
        // Row level security makes another account's deck invisible rather
        // than forbidden, so nothing matching is indistinguishable from, and
        // reported as, a deck this account does not have.
        'not-found',
      )
    },
  }
}
