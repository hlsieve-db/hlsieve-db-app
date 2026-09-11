import type { CardDataUpdateEntry } from './types'

// Add only reviewed, actually published updates. Do not infer historical entries.
export const CARD_DATA_UPDATE_HISTORY: readonly CardDataUpdateEntry[] = [
  {
    id: 'card-data-2026-09-12-official-qa',
    publishedAt: '2026-09-12',
    cardsDataVersion:
      'sha256:75896a6a8901d8c07714a8e9ece1d718bc73daeb8569fd0f40d2287b0e3960ea',
    printingsDataVersion:
      'sha256:4b9eb6b47999b1809d07f79e484ddc777c47aab7ab62eac6182b11661d67b9a4',
    summary: 'カードデータ・公式Q&A情報を更新しました',
    addedCards: 111,
    changedCards: 411,
    removedCards: 0,
    addedPrintings: 129,
    removedPrintings: 0,
    notes: [
      '9月19日発売「ボリュームヴォルテックス」のカード111枚を追加しました。',
      'カード詳細から655件の公式Q&Aを確認できるようになりました。',
    ],
  },
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
