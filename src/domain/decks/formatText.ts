import type { Card } from '../cards/types'
import { DEFAULT_DECK_NAME } from './constants'
import { getDeckZone } from './legality'
import type { Deck, DeckEntry, DeckZone } from './types'
import {
  getDeckDisplayCategory,
  sortDeckEntriesForDisplay,
} from './displayOrder'

const DECK_TEXT_ZONE_LABELS = {
  oshi: '推しホロメン',
  main: 'メインデッキ',
  cheer: 'エールデッキ',
  unknown: '未確認カード',
} as const

type DeckTextZone = DeckZone | 'unknown'

export type ResolvedDeckTextEntry = {
  entry: DeckEntry
  card?: Card
  zone: DeckTextZone
}

export type FormatDeckAsTextInput = {
  deck: Deck
  cards: readonly Card[]
  siteUrl?: string
}

export function resolveDeckTextEntries(
  deck: Deck,
  cards: readonly Card[],
): ResolvedDeckTextEntry[] {
  const cardsByNumber = new Map(cards.map((card) => [card.cardNumber, card]))
  return sortDeckEntriesForDisplay(deck.entries, cardsByNumber).map((entry) => {
    const card = cardsByNumber.get(entry.cardNumber)
    if (!card) return { entry, zone: 'unknown' }
    if (getDeckDisplayCategory(card) === 'unknown') {
      return { entry, card, zone: 'unknown' }
    }
    try {
      return { entry, card, zone: getDeckZone(card) }
    } catch {
      return { entry, card, zone: 'unknown' }
    }
  })
}

export function formatDeckAsText({
  deck,
  cards,
  siteUrl = 'https://hlsieve.com',
}: FormatDeckAsTextInput): string {
  const resolved = resolveDeckTextEntries(deck, cards)
  const zones: DeckTextZone[] = ['oshi', 'main', 'cheer', 'unknown']
  const lines = [
    'HLSieve DB Deck',
    `デッキ名: ${deck.name || DEFAULT_DECK_NAME}`,
  ]

  for (const zone of zones) {
    const entries = resolved.filter((item) => item.zone === zone)
    if (entries.length === 0) continue
    lines.push('', `【${DECK_TEXT_ZONE_LABELS[zone]}】`)
    for (const { entry, card } of entries) {
      lines.push(
        `${entry.quantity} ${entry.cardNumber} ${card?.name ?? '不明なカード'}`,
      )
    }
  }

  const count = (zone: DeckTextZone) =>
    resolved
      .filter((item) => item.zone === zone)
      .reduce((total, item) => total + item.entry.quantity, 0)
  const total = deck.entries.reduce((sum, entry) => sum + entry.quantity, 0)

  lines.push(
    '',
    `Main: ${count('main')}枚`,
    `Cheer: ${count('cheer')}枚`,
    `Total: ${total}枚`,
    '',
    siteUrl,
  )
  return lines.join('\n')
}
