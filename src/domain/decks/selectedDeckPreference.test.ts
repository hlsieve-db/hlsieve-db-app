import { describe, expect, it, vi } from 'vitest'

import type { Deck } from './types'
import {
  readSelectedDeckId,
  resolveSelectedDeckId,
  SELECTED_DECK_STORAGE_KEY,
  writeSelectedDeckId,
} from './selectedDeckPreference'

function deck(id: string): Deck {
  return {
    id,
    name: id,
    entries: [],
    createdAt: '2026-09-09T00:00:00.000Z',
    updatedAt: '2026-09-09T00:00:00.000Z',
  }
}

describe('selected deck preference', () => {
  it('reads and writes the shared preference key', () => {
    const getItem = vi.fn(() => ' deck-2 ')
    expect(readSelectedDeckId({ getItem })).toBe('deck-2')
    expect(getItem).toHaveBeenCalledWith(SELECTED_DECK_STORAGE_KEY)

    const setItem = vi.fn()
    writeSelectedDeckId('deck-1', { setItem })
    expect(setItem).toHaveBeenCalledWith(SELECTED_DECK_STORAGE_KEY, 'deck-1')
  })

  it('tolerates blocked storage and empty values', () => {
    expect(readSelectedDeckId({ getItem: () => '   ' })).toBeUndefined()
    expect(
      readSelectedDeckId({
        getItem: () => {
          throw new Error('blocked')
        },
      }),
    ).toBeUndefined()
    expect(() =>
      writeSelectedDeckId('deck-1', {
        setItem: () => {
          throw new Error('blocked')
        },
      }),
    ).not.toThrow()
  })

  it('keeps a valid preference and falls back to the first saved deck', () => {
    const decks = [deck('deck-1'), deck('deck-2')]
    expect(resolveSelectedDeckId(decks, 'deck-2')).toBe('deck-2')
    expect(resolveSelectedDeckId(decks, 'stale')).toBe('deck-1')
    expect(resolveSelectedDeckId([], 'stale')).toBeUndefined()
  })
})
