import { describe, expect, it, vi } from 'vitest'

import type { DeckBackupRepository } from './deckRepository'
import { withDeckOrganizationCascade } from './deckOrganizationCascade'

function decksRepository(): DeckBackupRepository {
  return {
    listDecks: vi.fn(async () => []),
    getDeck: vi.fn(async () => undefined),
    saveDeck: vi.fn(async () => undefined),
    deleteDeck: vi.fn(async () => undefined),
    importDecks: vi.fn(async () => undefined),
  }
}

describe('deleting a deck that was organized', () => {
  // One transaction, so no deck is left with an organization row nothing
  // points at, and no organization row outlives its deck.
  it('removes the deck and its organization together', async () => {
    const decks = decksRepository()
    const deleteDeck = vi.fn(async () => undefined)

    await withDeckOrganizationCascade(decks, { deleteDeck }).deleteDeck('a')

    expect(deleteDeck).toHaveBeenCalledWith('a')
    // Not also through the plain store, which would be a second transaction.
    expect(decks.deleteDeck).not.toHaveBeenCalled()
  })

  it('reports a failed delete rather than looking successful', async () => {
    const deleteDeck = vi.fn(async () => {
      throw new Error('blocked')
    })

    await expect(
      withDeckOrganizationCascade(decksRepository(), {
        deleteDeck,
      }).deleteDeck('a'),
    ).rejects.toThrow('blocked')
  })

  it('leaves every other operation as it was', async () => {
    const decks = decksRepository()
    const wrapped = withDeckOrganizationCascade(decks, {
      deleteDeck: vi.fn(async () => undefined),
    })

    await wrapped.listDecks()
    await wrapped.getDeck('a')
    await wrapped.importDecks([])

    expect(decks.listDecks).toHaveBeenCalled()
    expect(decks.getDeck).toHaveBeenCalledWith('a')
    expect(decks.importDecks).toHaveBeenCalledWith([])
  })
})
