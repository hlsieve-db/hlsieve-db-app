import { DECK_NAME_MAX_LENGTH } from './constants'
import type { Deck } from './types'

/**
 * Copying a deck.
 *
 * A separate deck from the moment it exists: its own id and its own timestamps,
 * so editing it cannot reach back into the deck it came from. The cards and the
 * format come across, because a copy nobody can tell from the original is the
 * point.
 */

const COPY_SUFFIX = 'のコピー'

/**
 * Names the copy, avoiding names already in use.
 *
 * Numbered from two upwards, because the first copy reads better without one.
 * The original name is shortened if it has to be: the suffix is what says this
 * is a copy, so it is the part worth keeping when something must go.
 */
export function buildDuplicateDeckName(
  name: string,
  existingNames: readonly string[],
): string {
  const taken = new Set(existingNames)

  const compose = (attempt: number): string => {
    const suffix = attempt === 1 ? COPY_SUFFIX : `${COPY_SUFFIX} ${attempt}`
    const room = DECK_NAME_MAX_LENGTH - suffix.length
    // A name long enough to leave no room is cut rather than the suffix, so
    // every copy still reads as one.
    return `${name.slice(0, Math.max(0, room))}${suffix}`
  }

  let attempt = 1
  let candidate = compose(attempt)
  while (taken.has(candidate)) {
    attempt += 1
    const next = compose(attempt)
    // The numbers grow; the length does not, so this terminates.
    if (next === candidate) return candidate
    candidate = next
  }
  return candidate
}

export type DuplicateDeckOptions = {
  id?: () => string
  now?: () => string
  /** Names already in use, so the copy does not take one of them. */
  existingNames?: readonly string[]
}

export function duplicateDeck(
  deck: Deck,
  options: DuplicateDeckOptions = {},
): Deck {
  const timestamp = (options.now ?? (() => new Date().toISOString()))()
  return {
    ...deck,
    id: (options.id ?? (() => crypto.randomUUID()))(),
    name: buildDuplicateDeckName(deck.name, options.existingNames ?? []),
    // Copied entry by entry: the two decks are edited separately from here.
    entries: deck.entries.map((entry) => ({ ...entry })),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}
