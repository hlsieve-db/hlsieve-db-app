/** @vitest-environment node */

import { describe, expect, it } from 'vitest'

import type { Card, CardQa } from '../../../src/domain/cards/types'
import { auditOfficialQas } from './auditOfficialQas'

function qa(overrides: Partial<CardQa> = {}): CardQa {
  return {
    id: 'Q617',
    question: '公式の質問ですか？',
    answer: 'はい、公式の回答です。',
    officialUrl: 'https://hololive-official-cardgame.com/cardlist/?id=614#faq',
    publishedAt: '2026-03-02',
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
  }
}

describe('official Q&A dataset audit', () => {
  it('accepts one stable Q&A identity linked to every related logical Card', () => {
    const relatedCardNumbers = ['hTEST-001', 'hTEST-002']
    const report = auditOfficialQas([
      card('hTEST-001', [qa({ relatedCardNumbers })]),
      card('hTEST-002', [
        qa({
          officialUrl:
            'https://hololive-official-cardgame.com/cardlist/?id=615#faq',
          relatedCardNumbers,
        }),
      ]),
      card('hTEST-003', []),
    ])

    expect(report).toMatchObject({
      totalOccurrences: 2,
      uniqueQas: 1,
      cardsWithQa: 2,
      cardsWithoutQa: 1,
      multiCardQas: 1,
      duplicateQaIds: 0,
      orphanQas: 0,
      invalidUrls: 0,
      emptyQuestions: 0,
      emptyAnswers: 0,
      issues: [],
      isValid: true,
    })
  })

  it('rejects duplicate IDs and conflicting content', () => {
    const report = auditOfficialQas([
      card('hTEST-001', [qa(), qa({ answer: '異なる回答' })]),
    ])

    expect(report.duplicateQaIds).toBe(1)
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['QA_DUPLICATE_ID', 'QA_ID_CONFLICT']),
    )
    expect(report.isValid).toBe(false)
  })

  it('rejects missing reverse linkage and orphan related cards', () => {
    const report = auditOfficialQas([
      card('hTEST-001', [
        qa({ relatedCardNumbers: ['hTEST-002', 'hMISSING-001'] }),
      ]),
      card('hTEST-002', []),
    ])

    expect(report.orphanQas).toBe(1)
    expect(
      report.issues.filter((issue) => issue.code === 'QA_ORPHAN_RELATION'),
    ).toHaveLength(3)
    expect(report.isValid).toBe(false)
  })

  it('rejects unexpected hosts, malformed URLs, and empty text', () => {
    const report = auditOfficialQas([
      card('hTEST-001', [
        qa({ question: ' ', answer: '', officialUrl: 'https://example.com/' }),
      ]),
    ])

    expect(report).toMatchObject({
      invalidUrls: 1,
      emptyQuestions: 1,
      emptyAnswers: 1,
      isValid: false,
    })
  })
})
