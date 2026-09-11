export type CardDataUpdateEntry = {
  id: string
  publishedAt: string
  cardsDataVersion?: string
  printingsDataVersion?: string
  summary: string
  addedCards: number
  changedCards: number
  removedCards: number
  addedPrintings: number
  removedPrintings: number
  notes?: string[]
}
