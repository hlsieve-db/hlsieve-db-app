/** @vitest-environment node */

import { describe, expect, it } from 'vitest'

import type { Card, CardsDataFile } from '../../../src/domain/cards/types'
import type { SearchIndexedCardCandidate } from '../searchIndex/types'
import { buildCardPrintingsDataFile } from '../generate/buildCardPrintingsDataFile'
import { serializeDataFile } from '../generate/serializeDataFile'
import { validateCardPrintingsSnapshotText } from './validateCardPrintingsSnapshot'

const CARDS_VERSION = `sha256:${'1'.repeat(64)}`

function logical(): CardsDataFile {
  return {
    format: 'holocard-cards',
    formatVersion: 1,
    dataVersion: CARDS_VERSION,
    generatedAt: '2026-09-08T00:00:00.000Z',
    cards: [{ cardNumber: 'TEST-001', imageUrl: 'https://img/1.png' } as Card],
  }
}

function candidate(): SearchIndexedCardCandidate {
  return {
    cardNumber: 'TEST-001',
    representativeImageOfficialId: '1',
    printings: [
      {
        officialId: '1',
        officialUrl: 'https://official/cards?id=1',
        isParallel: false,
        imageUrl: 'https://img/1.png',
        products: [{ name: 'Product' }],
      },
    ],
  } as SearchIndexedCardCandidate
}

function value() {
  const built = buildCardPrintingsDataFile([candidate()], logical())
  if (!built.ok) throw new Error(JSON.stringify(built.errors))
  return built.value
}

function serialize(input: unknown) {
  const result = serializeDataFile(input)
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.value
}

type MutableRecord = Record<string, unknown>

function mutableGroup(data: MutableRecord): MutableRecord {
  return (data.cards as MutableRecord)['TEST-001'] as MutableRecord
}

function mutablePrinting(data: MutableRecord): MutableRecord {
  return (mutableGroup(data).printings as MutableRecord[])[0]!
}

describe('validateCardPrintingsSnapshotText', () => {
  it('recomputes and accepts a canonical snapshot', () => {
    expect(
      validateCardPrintingsSnapshotText(serialize(value()), logical()).ok,
    ).toBe(true)
  })

  it('rejects an invalid printing dataVersion', () => {
    expect(
      validateCardPrintingsSnapshotText(
        serialize({ ...value(), dataVersion: `sha256:${'0'.repeat(64)}` }),
      ),
    ).toMatchObject({
      ok: false,
      errors: [expect.stringContaining('dataVersion')],
    })
  })

  it('rejects incompatible cardsDataVersion', () => {
    const cards = logical()
    cards.dataVersion = `sha256:${'9'.repeat(64)}`
    expect(
      validateCardPrintingsSnapshotText(serialize(value()), cards),
    ).toMatchObject({
      ok: false,
      errors: [expect.stringContaining('incompatible')],
    })
  })

  it.each([
    ['format', (data: MutableRecord) => (data.format = 'bad')],
    ['formatVersion', (data: MutableRecord) => (data.formatVersion = 2)],
    [
      'cardsDataVersion',
      (data: MutableRecord) => (data.cardsDataVersion = 'bad'),
    ],
    ['unknown top-level', (data: MutableRecord) => (data.unknown = true)],
    [
      'unknown group',
      (data: MutableRecord) => (mutableGroup(data).unknown = true),
    ],
    [
      'unknown printing',
      (data: MutableRecord) => (mutablePrinting(data).unknown = true),
    ],
    [
      'invalid boolean',
      (data: MutableRecord) => (mutablePrinting(data).isParallel = 'false'),
    ],
    [
      'malformed URL',
      (data: MutableRecord) => (mutablePrinting(data).officialUrl = 'bad'),
    ],
    [
      'empty group',
      (data: MutableRecord) => (mutableGroup(data).printings = []),
    ],
    [
      'missing default',
      (data: MutableRecord) =>
        delete mutableGroup(data).defaultPrintingOfficialId,
    ],
  ])('rejects %s', (_name, mutate) => {
    const data = structuredClone(value()) as unknown as MutableRecord
    mutate(data)
    expect(validateCardPrintingsSnapshotText(serialize(data)).ok).toBe(false)
  })
})
