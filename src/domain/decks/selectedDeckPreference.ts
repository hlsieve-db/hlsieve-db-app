import {
  ANONYMOUS_LOCAL_DATA_NAMESPACE,
  type LocalDataNamespace,
} from '../storage/localDataNamespace'
import type { Deck } from './types'

export const SELECTED_DECK_STORAGE_KEY = 'hlsieve:selected-deck'

/**
 * The single place this key is derived. The anonymous namespace keeps the
 * original key so an existing visitor's selection survives, and each account
 * gets its own so a switch does not point at a deck it cannot see.
 */
export function selectedDeckStorageKey(
  namespace: LocalDataNamespace = ANONYMOUS_LOCAL_DATA_NAMESPACE,
): string {
  return namespace.kind === 'anonymous'
    ? SELECTED_DECK_STORAGE_KEY
    : `${SELECTED_DECK_STORAGE_KEY}--${namespace.userId}`
}

export function readSelectedDeckId(
  storage: Pick<Storage, 'getItem'> = window.localStorage,
  namespace?: LocalDataNamespace,
): string | undefined {
  try {
    const value = storage.getItem(selectedDeckStorageKey(namespace))?.trim()
    return value || undefined
  } catch {
    return undefined
  }
}

export function writeSelectedDeckId(
  deckId: string,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
  namespace?: LocalDataNamespace,
): void {
  try {
    storage.setItem(selectedDeckStorageKey(namespace), deckId)
  } catch {
    // Selection still applies for the current page when storage is blocked.
  }
}

export function resolveSelectedDeckId(
  decks: readonly Deck[],
  preferredDeckId: string | undefined,
): string | undefined {
  if (preferredDeckId && decks.some((deck) => deck.id === preferredDeckId)) {
    return preferredDeckId
  }
  return decks[0]?.id
}
