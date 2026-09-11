/** @vitest-environment node */

import { describe, expect, it } from 'vitest'

import type { Card, CardQa } from '../../../src/domain/cards/types'
import { linkOfficialQas } from './linkOfficialQas'

function qa(overrides: Partial<CardQa> = {}): CardQa {
  return {
    id: 'Q712',
    question: '質問',
    answer: '回答',
    officialUrl: 'https://hololive-official-cardgame.com/cardlist/?id=1#faq',
    publishedAt: '2026-09-01',
    relatedCardNumbers: ['hTEST-001'],
    ...overrides,
  }
}

function card(cardNumber: string, qas: CardQa[]): Card {
  return {
    cardNumber,
    name: cardNumber,
    cardType: 'holomem',
    colors: ['white'],
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
    searchText: cardNumber,
    officialUrl: `https://hololive-official-cardgame.com/cardlist/?id=${cardNumber === 'hTEST-001' ? '1' : '2'}`,
  }
}

describe('logical Card Q&A linkage', () => {
  it('unions official related-card metadata and fills a stale related Card cache', () => {
    const result = linkOfficialQas([
      card('hTEST-001', [
        qa({ relatedCardNumbers: ['hTEST-001', 'hTEST-002'] }),
      ]),
      card('hTEST-002', []),
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cards.map((item) => item.qas.map((item) => item.id))).toEqual(
      [['Q712'], ['Q712']],
    )
    expect(result.cards[1]?.qas[0]).toMatchObject({
      question: '質問',
      answer: '回答',
      relatedCardNumbers: ['hTEST-001', 'hTEST-002'],
      officialUrl: 'https://hololive-official-cardgame.com/cardlist/?id=2#faq',
    })
  })

  it('accepts relation-set growth for identical official content', () => {
    const result = linkOfficialQas([
      card('hTEST-001', [qa()]),
      card('hTEST-002', [
        qa({ relatedCardNumbers: ['hTEST-001', 'hTEST-002'] }),
      ]),
    ])

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.cards[0]?.qas[0]?.relatedCardNumbers).toEqual([
        'hTEST-001',
        'hTEST-002',
      ])
    }
  })

  it('allows an intentionally partial fixture corpus to omit related Cards', () => {
    const result = linkOfficialQas(
      [
        card('hTEST-001', [
          qa({ relatedCardNumbers: ['hTEST-001', 'hMISSING-001'] }),
        ]),
      ],
      { requireEveryRelatedCard: false },
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.cards[0]?.qas[0]?.relatedCardNumbers).toEqual([
        'hMISSING-001',
        'hTEST-001',
      ])
    }
  })

  it('rejects conflicting content, unknown relations, and non-official card URLs', () => {
    expect(
      linkOfficialQas([
        card('hTEST-001', [qa()]),
        card('hTEST-002', [
          qa({ answer: '別回答', relatedCardNumbers: ['hTEST-002'] }),
        ]),
      ]),
    ).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'QA_ID_CONFLICT' }),
      ]),
    })
    expect(
      linkOfficialQas([
        card('hTEST-001', [qa({ relatedCardNumbers: ['hMISSING-001'] })]),
      ]),
    ).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'QA_ORPHAN_RELATION' }),
      ]),
    })
    expect(
      linkOfficialQas([
        {
          ...card('hTEST-001', [qa()]),
          officialUrl: 'https://example.com/card',
        },
      ]),
    ).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'QA_INVALID_URL' }),
      ]),
    })
  })
})
