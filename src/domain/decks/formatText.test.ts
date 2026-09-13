import { describe, expect, it } from 'vitest'

import type { Card } from '../cards/types'
import type { Deck } from './types'
import { formatDeckAsText, resolveDeckTextEntries } from './formatText'

function card(
  cardNumber: string,
  name: string,
  cardType: Card['cardType'],
  overrides: Partial<Card> = {},
): Card {
  return {
    cardNumber,
    name,
    imageUrl: `https://example.test/${cardNumber}.png`,
    cardType,
    colors: ['white'],
    isBuzz: false,
    tags: [],
    isLimited: false,
    abilities: [],
    arts: [],
    batonPass: [],
    effectTags: [],
    criticalColors: [],
    rarities: [],
    products: [],
    illustrators: [],
    qas: [],
    searchText: `${cardNumber} ${name}`,
    ...overrides,
  }
}

function deck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'deck-1',
    name: '日本語🎴デッキ',
    entries: [
      { cardNumber: 'MAIN-2', quantity: 3 },
      { cardNumber: 'OSHI-1', quantity: 1 },
      { cardNumber: 'CHEER-1', quantity: 10 },
      { cardNumber: 'MAIN-1', quantity: 4 },
      { cardNumber: 'UNKNOWN-1', quantity: 2 },
      { cardNumber: 'CHEER-2', quantity: 5 },
    ],
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
    ...overrides,
  }
}

const cards = [
  card('OSHI-1', '推しカード', 'oshi'),
  card('MAIN-1', 'メイン一', 'holomem'),
  card('MAIN-2', '制限メイン二', 'support'),
  card('CHEER-1', '白エール', 'cheer'),
  card('CHEER-2', '青エール', 'cheer', { colors: ['blue'] }),
]

describe('formatDeckAsText', () => {
  it('formats a readable branded Deck list with stable LF line endings', () => {
    const text = formatDeckAsText({ deck: deck(), cards })

    expect(text).toBe(
      [
        'HLSieve DB Deck',
        'デッキ名: 日本語🎴デッキ',
        '',
        '【推しホロメン】',
        '1 OSHI-1 推しカード',
        '',
        '【メインデッキ】',
        '3 MAIN-2 制限メイン二',
        '4 MAIN-1 メイン一',
        '',
        '【エールデッキ】',
        '10 CHEER-1 白エール',
        '5 CHEER-2 青エール',
        '',
        '【未確認カード】',
        '2 UNKNOWN-1 不明なカード',
        '',
        'Main: 7枚',
        'Cheer: 15枚',
        'Total: 25枚',
        '',
        'https://hlsieve.com',
      ].join('\n'),
    )
    expect(text).not.toContain('\r')
  })

  it('uses the existing Deck-zone domain rule without card-number heuristics', () => {
    const resolved = resolveDeckTextEntries(deck(), cards)

    expect(resolved.map(({ entry, zone }) => [entry.cardNumber, zone])).toEqual(
      [
        ['MAIN-2', 'main'],
        ['OSHI-1', 'oshi'],
        ['CHEER-1', 'cheer'],
        ['MAIN-1', 'main'],
        ['UNKNOWN-1', 'unknown'],
        ['CHEER-2', 'cheer'],
      ],
    )
  })

  it('preserves original entry order inside each section without duplication', () => {
    const text = formatDeckAsText({ deck: deck(), cards })

    expect(text.indexOf('MAIN-2')).toBeLessThan(text.indexOf('MAIN-1'))
    expect(text.indexOf('CHEER-1')).toBeLessThan(text.indexOf('CHEER-2'))
    for (const cardNumber of deck().entries.map((entry) => entry.cardNumber)) {
      expect(text.match(new RegExp(cardNumber, 'g'))).toHaveLength(1)
    }
  })

  it('exports unknown and restricted cards instead of rejecting them', () => {
    const text = formatDeckAsText({
      deck: deck({
        entries: [
          { cardNumber: 'MAIN-2', quantity: 8 },
          { cardNumber: 'MISSING-999', quantity: 2 },
        ],
      }),
      cards,
    })

    expect(text).toContain('8 MAIN-2 制限メイン二')
    expect(text).toContain('2 MISSING-999 不明なカード')
    expect(text).toContain('Main: 8枚')
    expect(text).toContain('Total: 10枚')
  })

  it('supports shared-Deck-shaped content and a custom site URL', () => {
    const text = formatDeckAsText({
      deck: deck({ name: '共有デッキ', entries: deck().entries.slice(0, 2) }),
      cards,
      siteUrl: 'https://example.test',
    })

    expect(text).toContain('デッキ名: 共有デッキ')
    expect(text).toContain('https://example.test')
  })

  it('uses the existing default name only for an empty legacy name', () => {
    expect(formatDeckAsText({ deck: deck({ name: '' }), cards })).toContain(
      'デッキ名: 無題のデッキ',
    )
  })

  it('does not export images, printing metadata, share state, or legality labels', () => {
    const text = formatDeckAsText({ deck: deck(), cards })

    expect(text).not.toContain('example.test')
    expect(text).not.toContain('officialId')
    expect(text).not.toContain('?d=')
    expect(text).not.toMatch(/合法|違反/)
  })

  it('formats an empty Deck deterministically for domain callers', () => {
    expect(formatDeckAsText({ deck: deck({ entries: [] }), cards })).toBe(
      [
        'HLSieve DB Deck',
        'デッキ名: 日本語🎴デッキ',
        '',
        'Main: 0枚',
        'Cheer: 0枚',
        'Total: 0枚',
        '',
        'https://hlsieve.com',
      ].join('\n'),
    )
  })
})
