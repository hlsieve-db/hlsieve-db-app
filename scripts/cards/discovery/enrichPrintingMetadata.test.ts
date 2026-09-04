/** @vitest-environment node */

import { describe, expect, it } from 'vitest'

import type { CardPrinting } from '../../../src/domain/cards/types'
import type { NormalizedCardCandidate } from '../normalize/types'
import { enrichPrintingMetadata } from './enrichPrintingMetadata'
import type { DiscoveredCard, DiscoveredSpecialEntry } from './types'

function candidate(
  overrides: Partial<NormalizedCardCandidate> = {},
): NormalizedCardCandidate {
  return {
    officialId: '100',
    officialUrl: 'https://official.example/cardlist/?id=100',
    cardNumber: 'hTEST-001',
    name: 'Test Card',
    imageUrl: 'https://official.example/images/plain.png',
    cardType: 'holomem',
    isBuzz: false,
    colors: ['blue'],
    bloomLevel: 'first',
    hp: 100,
    tags: [],
    isLimited: false,
    batonPass: [],
    abilities: [],
    arts: [],
    rarity: 'R',
    products: [],
    qas: [],
    ...overrides,
  }
}

function discoveredCard(
  overrides: Partial<DiscoveredCard> = {},
): DiscoveredCard {
  return {
    kind: 'card',
    officialId: '100',
    detailUrl: 'https://official.example/cardlist/?id=100',
    cardNumber: 'hTEST-001',
    name: 'Test Card',
    imageUrl: 'https://official.example/images/plain.png',
    isParallel: false,
    sourceSearchUrl: 'https://official.example/cardlist/cardsearch/',
    ...overrides,
  }
}

describe('Discovery printing metadata enrichment', () => {
  it.each([true, false])('preserves explicit isParallel=%s', (isParallel) => {
    const result = enrichPrintingMetadata(candidate(), [
      discoveredCard({ isParallel }),
    ])
    expect(result).toMatchObject({
      ok: true,
      value: { officialId: '100', isParallel },
    })
  })

  it('joins by officialId instead of cardNumber', () => {
    const result = enrichPrintingMetadata(candidate(), [
      discoveredCard({ officialId: '101', isParallel: true }),
    ])
    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: 'DISCOVERY_METADATA_MISSING' })],
    })
  })

  it('fails instead of defaulting when Discovery metadata is missing', () => {
    expect(enrichPrintingMetadata(candidate(), [])).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: 'DISCOVERY_METADATA_MISSING' })],
    })
  })

  it('rejects a matching special entry', () => {
    const special: DiscoveredSpecialEntry = {
      kind: 'special',
      officialId: '100',
      name: 'Special',
      sourceSearchUrl: 'https://official.example/cardlist/cardsearch/',
    }
    expect(enrichPrintingMetadata(candidate(), [special])).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: 'DISCOVERY_ENTRY_NOT_CARD' })],
    })
  })

  it('rejects duplicate Discovery entries including contradictory parallel values', () => {
    expect(
      enrichPrintingMetadata(candidate(), [
        discoveredCard({ isParallel: false }),
        discoveredCard({ isParallel: true }),
      ]),
    ).toMatchObject({
      ok: false,
      errors: [
        expect.objectContaining({ code: 'DISCOVERY_METADATA_DUPLICATE' }),
      ],
    })
  })

  it('rejects contradictory cardNumber metadata for the same officialId', () => {
    expect(
      enrichPrintingMetadata(candidate(), [
        discoveredCard({ cardNumber: 'hOTHER-001' }),
      ]),
    ).toMatchObject({
      ok: false,
      errors: [
        expect.objectContaining({ code: 'DISCOVERY_METADATA_CONFLICT' }),
      ],
    })
  })

  it('does not infer parallel status from filename, rarity, or a large officialId', () => {
    const normalized = candidate({
      officialId: '999999',
      imageUrl: 'https://official.example/images/card_P_02.png',
      rarity: 'UR',
    })
    const result = enrichPrintingMetadata(normalized, [
      discoveredCard({ officialId: '999999', isParallel: false }),
    ])
    expect(result).toMatchObject({ ok: true, value: { isParallel: false } })
  })

  it('uses true Discovery membership even with an ordinary filename', () => {
    const result = enrichPrintingMetadata(candidate(), [
      discoveredCard({ isParallel: true }),
    ])
    expect(result).toMatchObject({ ok: true, value: { isParallel: true } })
  })

  it('requires isParallel on the persistent CardPrinting type', () => {
    const printing: CardPrinting = {
      officialId: '100',
      officialUrl: 'https://official.example/cardlist/?id=100',
      isParallel: true,
      firstSeenAt: '2026-09-04T00:00:00.000Z',
      lastCheckedAt: '2026-09-04T00:00:00.000Z',
    }
    expect(printing.isParallel).toBe(true)
  })
})
