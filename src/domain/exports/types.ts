import type { DeckCard } from '../decks/types'

export type ExportedDeck = {
  name: string
  oshi: DeckCard[]
  main: DeckCard[]
  cheer: DeckCard[]
  createdAt?: string
  updatedAt?: string
}

export type DeckExportFile = {
  format: 'holocard-deck'
  formatVersion: 1
  exportedAt: string
  deck: ExportedDeck
}

export type DeckBackupFile = {
  format: 'holocard-deck-backup'
  formatVersion: 1
  exportedAt: string
  decks: ExportedDeck[]
}
