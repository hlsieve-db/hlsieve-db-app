import { describe, expect, it, vi } from 'vitest'

import type { DeckBackupRepository } from './deckRepository'
import { withDeckVersionCascade } from './deckVersionCascade'

describe('local DeckVersion cascade', () => {
  it('deletes Versions before the parent Deck', async () => {
    const order: string[] = []
    const decks = {
      listDecks: vi.fn(async () => []),
      getDeck: vi.fn(async () => undefined),
      saveDeck: vi.fn(async () => undefined),
      importDecks: vi.fn(async () => undefined),
      deleteDeck: vi.fn(async () => {
        order.push('deck')
      }),
    } satisfies DeckBackupRepository
    const versions = {
      deleteVersionsForDeck: vi.fn(async () => {
        order.push('versions')
      }),
    }
    await withDeckVersionCascade(decks, versions).deleteDeck('deck-1')
    expect(order).toEqual(['versions', 'deck'])
  })

  it('keeps the parent when Version deletion fails', async () => {
    const decks = {
      listDecks: vi.fn(async () => []),
      getDeck: vi.fn(async () => undefined),
      saveDeck: vi.fn(async () => undefined),
      importDecks: vi.fn(async () => undefined),
      deleteDeck: vi.fn(async () => undefined),
    } satisfies DeckBackupRepository
    const failure = new Error('blocked')
    const versions = {
      deleteVersionsForDeck: vi.fn(async () => Promise.reject(failure)),
    }
    await expect(
      withDeckVersionCascade(decks, versions).deleteDeck('deck-1'),
    ).rejects.toBe(failure)
    expect(decks.deleteDeck).not.toHaveBeenCalled()
  })
})
