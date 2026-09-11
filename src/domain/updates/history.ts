import type { CardDataUpdateEntry } from './types'

// Add only reviewed, actually published updates. Do not infer historical entries.
export const CARD_DATA_UPDATE_HISTORY: readonly CardDataUpdateEntry[] = [
  {
    id: 'card-data-2026-09-11',
    publishedAt: '2026-09-11',
    cardsDataVersion:
      'sha256:91388bb696beb83acb2371b130e07792bbfd7f743322b489b9b7345eda585ad8',
    printingsDataVersion:
      'sha256:6dc8dcce77d980ca8f6aadf885d5295f9e058f8eebfea6712eed82c5a0ca630b',
    summary: 'カード情報を修正しました',
    addedCards: 0,
    changedCards: 1,
    removedCards: 0,
    addedPrintings: 0,
    removedPrintings: 0,
    notes: ['hBP07-076のBuzz分類を修正しました。'],
  },
]

export function formatUpdateDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[1]}/${match[2]}/${match[3]}` : value
}

export function latestFirst(
  entries: readonly CardDataUpdateEntry[],
): CardDataUpdateEntry[] {
  return [...entries].sort((left, right) => {
    const byDate = right.publishedAt.localeCompare(left.publishedAt, 'en')
    return byDate || right.id.localeCompare(left.id, 'en')
  })
}
