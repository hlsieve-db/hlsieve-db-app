import type { Deck } from './types'

export const SELECTED_DECK_STORAGE_KEY = 'hlsieve:selected-deck'

export function readSelectedDeckId(
  storage: Pick<Storage, 'getItem'> = window.localStorage,
): string | undefined {
  try {
    const value = storage.getItem(SELECTED_DECK_STORAGE_KEY)?.trim()
    return value || undefined
  } catch {
    return undefined
  }
}

export function writeSelectedDeckId(
  deckId: string,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
): void {
  try {
    storage.setItem(SELECTED_DECK_STORAGE_KEY, deckId)
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
