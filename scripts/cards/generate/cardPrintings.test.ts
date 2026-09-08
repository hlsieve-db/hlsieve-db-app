/** @vitest-environment node */

import { describe, expect, it } from 'vitest'

import type { Card, CardsDataFile } from '../../../src/domain/cards/types'
import type { SearchIndexedCardCandidate } from '../searchIndex/types'
import { buildCardPrintingsDataFile } from './buildCardPrintingsDataFile'

const VERSION = `sha256:${'1'.repeat(64)}`

function cardsData(
  cardNumber = 'TEST-001',
  imageUrl = 'https://img/2.png',
): CardsDataFile {
  return {
    format: 'holocard-cards',
    formatVersion: 1,
    dataVersion: VERSION,
    generatedAt: '2026-09-08T00:00:00.000Z',
    cards: [{ cardNumber, imageUrl } as Card],
  }
}

function candidate(
  overrides: Partial<SearchIndexedCardCandidate> = {},
): SearchIndexedCardCandidate {
  return {
    cardNumber: 'TEST-001',
    representativeImageOfficialId: '2',
    printings: [
      {
        officialId: '10',
        officialUrl: 'https://official/cards?id=10',
        isParallel: true,
        imageUrl: 'https://img/10.png',
        rarity: 'SR',
        products: [{ name: 'Z' }, { name: 'A' }, { name: 'A' }],
        illustrator: 'Artist',
      },
      {
        officialId: '3',
        officialUrl: 'https://official/cards?id=3',
        isParallel: false,
        imageUrl: 'https://img/3.png',
        rarity: 'R',
        products: [{ name: 'B' }],
      },
      {
        officialId: '2',
        officialUrl: 'https://official/cards?id=2',
        isParallel: false,
        imageUrl: 'https://img/2.png',
        rarity: 'R',
        products: [{ name: 'A' }],
      },
      {
        officialId: '11',
        officialUrl: 'https://official/cards?id=11',
        isParallel: true,
        products: [],
      },
    ],
    ...overrides,
  } as SearchIndexedCardCandidate
}

function success(input = [candidate()], logical = cardsData()) {
  const result = buildCardPrintingsDataFile(input, logical)
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.value
}

describe('buildCardPrintingsDataFile', () => {
  it('publishes single-printing groups', () => {
    const one = candidate({
      representativeImageOfficialId: '2',
      printings: candidate().printings.slice(2, 3),
    })
    expect(success([one]).cards['TEST-001']?.printings).toHaveLength(1)
  })

  it('puts the default first, then normal and parallel IDs numerically', () => {
    expect(
      success().cards['TEST-001']?.printings.map((item) => item.officialId),
    ).toEqual(['2', '3', '10', '11'])
  })

  it('publishes only product names with deterministic dedupe and order', () => {
    expect(success().cards['TEST-001']?.printings[2]?.products).toEqual([
      'A',
      'Z',
    ])
  })

  it('keeps illustrator, image, and rarity optional', () => {
    expect(success().cards['TEST-001']?.printings[3]).toEqual({
      officialId: '11',
      officialUrl: 'https://official/cards?id=11',
      isParallel: true,
      products: [],
    })
  })

  it('does not leak semantic or internal fields', () => {
    const text = JSON.stringify(success())
    for (const field of ['isBuzz', 'abilities', 'conflicts', 'contentHash']) {
      expect(text).not.toContain(`"${field}"`)
    }
    expect(text).not.toContain('representativeImageOfficialId')
  })

  it('is deterministic across candidate and printing input order', () => {
    const reversed = candidate({
      printings: [...candidate().printings].reverse(),
    })
    expect(success([reversed])).toEqual(success())
  })

  it('sorts record keys by Unicode code point', () => {
    const second = candidate({
      cardNumber: 'AAA-001',
      representativeImageOfficialId: '20',
      printings: [{ ...candidate().printings[2]!, officialId: '20' }],
    })
    const logical = cardsData()
    logical.cards.unshift({
      cardNumber: 'AAA-001',
      imageUrl: 'https://img/2.png',
    } as Card)
    expect(Object.keys(success([candidate(), second], logical))).toEqual([
      'format',
      'formatVersion',
      'cardsDataVersion',
      'dataVersion',
      'cards',
    ])
    expect(Object.keys(success([candidate(), second], logical).cards)).toEqual([
      'AAA-001',
      'TEST-001',
    ])
  })

  it('copies cardsDataVersion without including it in printing dataVersion', () => {
    const first = success()
    const changed = cardsData()
    changed.dataVersion = `sha256:${'2'.repeat(64)}`
    const second = success([candidate()], changed)
    expect(second.cardsDataVersion).not.toBe(first.cardsDataVersion)
    expect(second.dataVersion).toBe(first.dataVersion)
  })

  it.each([
    ['imageUrl', 'https://img/changed.png'],
    ['rarity', 'UR'],
    ['officialUrl', 'https://official/cards?id=2&changed=1'],
    ['illustrator', 'Changed'],
    ['isParallel', true],
  ] as const)('changes dataVersion when %s changes', (field, value) => {
    const changed = candidate()
    changed.printings = changed.printings.map((printing) =>
      printing.officialId === '2' ? { ...printing, [field]: value } : printing,
    )
    if (field === 'imageUrl') {
      expect(
        success([changed], cardsData('TEST-001', String(value))).dataVersion,
      ).not.toBe(success().dataVersion)
    } else {
      expect(success([changed]).dataVersion).not.toBe(success().dataVersion)
    }
  })

  it('changes dataVersion when a product name changes', () => {
    const changed = candidate()
    changed.printings[0] = {
      ...changed.printings[0]!,
      products: [{ name: 'Changed' }],
    }
    expect(success([changed]).dataVersion).not.toBe(success().dataVersion)
  })

  it.each([
    [
      'missing default',
      candidate({ representativeImageOfficialId: undefined }),
    ],
    ['unknown default', candidate({ representativeImageOfficialId: '999' })],
    [
      'non-numeric ID',
      candidate({
        representativeImageOfficialId: 'x',
        printings: [{ ...candidate().printings[0]!, officialId: 'x' }],
      }),
    ],
    [
      'duplicate ID',
      candidate({
        printings: [...candidate().printings, candidate().printings[0]!],
      }),
    ],
  ])('rejects %s', (_name, input) => {
    expect(buildCardPrintingsDataFile([input], cardsData()).ok).toBe(false)
  })
})
