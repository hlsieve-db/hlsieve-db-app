import { describe, expect, it } from 'vitest'

import type { Card, CardQa } from '../cards/types'
import {
  buildOfficialQaSearchIndex,
  searchOfficialQa,
} from './officialQaSearch'

function qa(overrides: Partial<CardQa> = {}): CardQa {
  return {
    id: 'Q617',
    question: 'エールを手札に加えられますか？',
    answer: 'はい、手札に加えられます。',
    officialUrl: 'https://example.com/q617',
    publishedAt: '2026-03-02',
    relatedCardNumbers: ['hBP03-050'],
    ...overrides,
  }
}

function card(cardNumber: string, name: string, qas: CardQa[] = []): Card {
  return {
    cardNumber,
    name,
    cardType: 'holomem',
    colors: ['blue'],
    isBuzz: false,
    tags: [],
    abilities: [],
    arts: [],
    batonPass: [],
    effectTags: [],
    criticalColors: [],
    rarities: [],
    products: [],
    illustrators: [],
    qas,
    searchText: '',
  }
}

describe('buildOfficialQaSearchIndex', () => {
  it('deduplicates official IDs and merges owning, declared, and unknown related cards', () => {
    const index = buildOfficialQaSearchIndex([
      card('hBP03-050', 'FUWAMOCO', [qa()]),
      card('hBP03-051', 'フワワ', [
        qa({ relatedCardNumbers: ['hBP03-051', 'UNKNOWN-001'] }),
      ]),
    ])

    expect(index).toHaveLength(1)
    expect(index[0]).toMatchObject({
      id: 'Q617',
      question: 'エールを手札に加えられますか？',
      answer: 'はい、手札に加えられます。',
      officialUrl: 'https://example.com/q617',
      publishedAt: '2026-03-02',
      relatedCards: [
        { cardNumber: 'hBP03-050', name: 'FUWAMOCO' },
        { cardNumber: 'hBP03-051', name: 'フワワ' },
        { cardNumber: 'UNKNOWN-001', name: undefined },
      ],
    })
    expect(new Set(index.map(({ id }) => id)).size).toBe(index.length)
  })
})

describe('searchOfficialQa', () => {
  const index = buildOfficialQaSearchIndex([
    card('hBP03-050', 'FUWAMOCO', [qa()]),
    card('TEST-002', 'AZKi', [
      qa({
        id: 'Q61',
        question: 'アーカイブから戻せますか？',
        answer: 'いいえ、戻せません。',
        officialUrl: 'https://example.com/q61',
        relatedCardNumbers: ['TEST-002'],
      }),
    ]),
    card('TEST-003', 'Marine', [
      qa({
        id: 'Q700',
        question: 'Q617を参照する質問',
        answer: '別の回答です。',
        officialUrl: 'https://example.com/q700',
        relatedCardNumbers: ['TEST-003'],
      }),
    ]),
  ])

  it.each(['Q617', '617', 'q617', '  Ｑ６１７  '])(
    'matches an official Q number from %s and ranks the exact ID first',
    (query) => {
      expect(searchOfficialQa(index, query).map(({ id }) => id)).toEqual([
        'Q617',
        'Q700',
      ])
    },
  )

  it.each([
    ['質問の一部', 'エールを', 'Q617'],
    ['回答の一部', '加えられます', 'Q617'],
    ['カード名・大文字小文字', 'fuwamoco', 'Q617'],
    ['カード番号', 'HBP03-050', 'Q617'],
  ])('finds by %s', (_label, query, expected) => {
    expect(searchOfficialQa(index, query).map(({ id }) => id)).toContain(
      expected,
    )
  })

  it('uses AND semantics across normalized words', () => {
    expect(
      searchOfficialQa(index, ' エール　手札 ').map(({ id }) => id),
    ).toEqual(['Q617'])
    expect(searchOfficialQa(index, 'エール AZKi')).toEqual([])
  })

  it('returns deterministic Q-number order for same-rank matches', () => {
    expect(searchOfficialQa(index, '戻せ').map(({ id }) => id)).toEqual(['Q61'])
    expect(searchOfficialQa(index, '')).toEqual([])
    expect(searchOfficialQa(index, 'no match')).toEqual([])
  })
})
