import type { SupabaseClient } from '@supabase/supabase-js'

import {
  MAX_SHARED_DECK_JSON_LENGTH,
  validateSharedDeckPayload,
} from '../domain/share/deckShareCodec'
import { isShortShareId } from '../domain/share/shortShare'
import type { SharedDeckPayloadV1 } from '../domain/share/types'
import { getSupabaseClient } from '../lib/supabaseClient'

/**
 * Short deck shares, reached only through the two database functions. The
 * table itself is not exposed, so there is no client-side query to write here
 * and no way to ask for anything but one snapshot at a time.
 *
 * Confining the SDK to this file keeps the pages testable with a plain fake,
 * the same arrangement AuthSource uses.
 */

export type ShortShareCreateFailure =
  'unavailable' | 'sign-in-required' | 'too-large' | 'invalid-deck' | 'failed'

export type ShortShareCreateResult =
  { ok: true; shareId: string } | { ok: false; reason: ShortShareCreateFailure }

export type ShortShareLoadFailure =
  'unavailable' | 'invalid-id' | 'not-found' | 'malformed' | 'failed'

export type ShortShareLoadResult =
  | { ok: true; payload: SharedDeckPayloadV1 }
  | { ok: false; reason: ShortShareLoadFailure }

export type DeckShareSource = {
  createShare: (payload: SharedDeckPayloadV1) => Promise<ShortShareCreateResult>
  loadShare: (shareId: string) => Promise<ShortShareLoadResult>
}

type SupabaseFailure = { code?: string; message?: string } | null

/**
 * Sorts a database error into the cases the UI words differently. The message
 * is never shown, so nothing from the database reaches the page.
 */
export function classifyCreateFailure(
  error: SupabaseFailure,
): ShortShareCreateFailure {
  // 42501 is raised both by the missing grant and by the function's own check,
  // so a signed out caller lands here whichever control stopped them.
  if (error?.code === '42501') return 'sign-in-required'
  // The function raises invalid_parameter_value for anything the share
  // contract rejects; 22023 is that SQLSTATE.
  if (error?.code === '22023') {
    return /too large/i.test(error.message ?? '') ? 'too-large' : 'invalid-deck'
  }
  return 'failed'
}

/** Null when Cloud Sync is not configured, which means no short links. */
export function createSupabaseDeckShareSource(
  client: SupabaseClient | null = getSupabaseClient(),
): DeckShareSource | null {
  if (!client) return null

  return {
    async createShare(payload) {
      // Checked here too, so an oversized deck never leaves the browser.
      if (JSON.stringify(payload).length > MAX_SHARED_DECK_JSON_LENGTH) {
        return { ok: false, reason: 'too-large' }
      }
      try {
        const { data, error } = await client.rpc('create_deck_share', {
          deck: payload,
        })
        if (error) return { ok: false, reason: classifyCreateFailure(error) }
        if (typeof data !== 'string' || !isShortShareId(data)) {
          return { ok: false, reason: 'failed' }
        }
        return { ok: true, shareId: data }
      } catch {
        // Thrown rather than returned means the request never completed.
        return { ok: false, reason: 'failed' }
      }
    },

    async loadShare(shareId) {
      if (!isShortShareId(shareId)) return { ok: false, reason: 'invalid-id' }
      try {
        const { data, error } = await client.rpc('get_deck_share', {
          share_id: shareId,
        })
        if (error) return { ok: false, reason: 'failed' }
        if (data === null || data === undefined) {
          return { ok: false, reason: 'not-found' }
        }
        // A stored snapshot is validated exactly like one from a query string:
        // it is data someone else wrote, and the row may predate a contract
        // change.
        if (JSON.stringify(data).length > MAX_SHARED_DECK_JSON_LENGTH) {
          return { ok: false, reason: 'malformed' }
        }
        const validated = validateSharedDeckPayload(data)
        return validated.ok
          ? { ok: true, payload: validated.value }
          : { ok: false, reason: 'malformed' }
      } catch {
        return { ok: false, reason: 'failed' }
      }
    },
  }
}
