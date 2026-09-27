import type { DeckId } from '../decks/types'

export type DeckFolderId = string
export type DeckTagId = string

export type DeckFolder = {
  id: DeckFolderId
  name: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type DeckTag = {
  id: DeckTagId
  name: string
  createdAt: string
  updatedAt: string
}

/**
 * Organization metadata is deliberately separate from Deck. Its absence means
 * the deck has never had organization metadata; an active row with no folder
 * and no tags means the reporter explicitly cleared it.
 */
export type DeckOrganization = {
  deckId: DeckId
  folderId?: DeckFolderId
  tagIds: DeckTagId[]
  createdAt: string
  updatedAt: string
}
