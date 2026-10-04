import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Card } from '../../../src/domain/cards/types'
import type { TournamentDeck } from '../../../src/domain/tournaments/types'
import {
  COLLECTOR_PARSER_VERSION,
  diagnoseDeckValidation,
  getOrCollectDeck,
  loadCachedDeck,
  saveValidatedDeck,
  validateDeckForCache,
} from './cache'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  )
})

function card(cardNumber: string, cardType: Card['cardType']): Card {
  return {
    cardNumber,
    name: cardNumber,
    imageUrl: `${cardNumber}.png`,
    cardType,
    colors: [],
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
    qas: [],
    searchText: cardNumber,
  }
}

const cards = [
  card('OSHI-1', 'oshi'),
  card('MAIN-1', 'holomem'),
  card('CHEER-1', 'cheer'),
]

const deck: TournamentDeck = {
  oshi: [{ cardNumber: 'OSHI-1', quantity: 1 }],
  main: [{ cardNumber: 'MAIN-1', quantity: 50 }],
  cheer: [{ cardNumber: 'CHEER-1', quantity: 20 }],
}

async function root(): Promise<string> {
  const value = await mkdtemp(resolve(tmpdir(), 'hlsieve-collector-'))
  roots.push(value)
  return value
}

describe('Deck Collector cache', () => {
  it('diagnoses strict validation failures without changing validator parity', () => {
    const cases: TournamentDeck[] = [
      deck,
      { ...deck, main: [{ cardNumber: 'UNKNOWN', quantity: 50 }] },
      { ...deck, main: [{ cardNumber: 'OSHI-1', quantity: 50 }] },
      { ...deck, main: [{ cardNumber: 'MAIN-1', quantity: 49 }] },
      {
        ...deck,
        main: [
          { cardNumber: 'MAIN-1', quantity: 25 },
          { cardNumber: 'MAIN-1', quantity: 25 },
        ],
      },
    ]
    for (const candidate of cases) {
      expect(diagnoseDeckValidation(candidate, cards).valid).toBe(
        validateDeckForCache(candidate, cards),
      )
    }
    expect(diagnoseDeckValidation(deck, cards)).toEqual({
      valid: true,
      issues: [],
    })
    expect(diagnoseDeckValidation(cases[1]!, cards).issues).toContainEqual({
      type: 'unknown-card',
      cardNumber: 'UNKNOWN',
      expectedZone: 'main',
    })
    expect(diagnoseDeckValidation(cases[2]!, cards).issues).toContainEqual({
      type: 'zone-mismatch',
      cardNumber: 'OSHI-1',
      deckZone: 'main',
      catalogZone: 'oshi',
    })
    expect(diagnoseDeckValidation(cases[3]!, cards).issues).toContainEqual({
      type: 'invalid-total',
      zone: 'main',
      expected: 50,
      actual: 49,
    })
    expect(diagnoseDeckValidation(cases[4]!, cards).issues).toContainEqual({
      type: 'duplicate',
      zone: 'main',
      cardNumber: 'MAIN-1',
    })
  })

  it('keeps malformed parsed data outside the valid cache boundary', async () => {
    const malformed = {
      ...deck,
      main: [{ cardNumber: 'MAIN-1', quantity: 0 }],
    } as TournamentDeck
    expect(diagnoseDeckValidation(malformed, cards)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        { type: 'malformed-entry', zone: 'main', index: 0 },
        { type: 'invalid-total', zone: 'main', expected: 50, actual: 0 },
      ]),
    })
    expect(validateDeckForCache(malformed, cards)).toBe(false)
    await expect(
      saveValidatedDeck('INVALID', malformed, cards, { root: await root() }),
    ).rejects.toThrow(/Refusing to cache/)
  })

  it('does not recollect a known validated Deck code', async () => {
    const cacheRoot = await root()
    await saveValidatedDeck('CODE1', deck, cards, { root: cacheRoot })
    const collect = vi.fn(async () => deck)
    await expect(
      getOrCollectDeck('CODE1', collect, cards, { root: cacheRoot }),
    ).resolves.toEqual(deck)
    expect(collect).not.toHaveBeenCalled()
  })

  it('invalidates a cached Deck when the parser version differs', async () => {
    const cacheRoot = await root()
    await saveValidatedDeck('CODE1', deck, cards, { root: cacheRoot })
    const path = resolve(cacheRoot, 'decks', 'CODE1.json')
    const record = JSON.parse(await readFile(path, 'utf8')) as {
      parserVersion: number
    }
    record.parserVersion = COLLECTOR_PARSER_VERSION + 1
    await writeFile(path, JSON.stringify(record), 'utf8')
    await expect(
      loadCachedDeck('CODE1', { root: cacheRoot }),
    ).resolves.toBeUndefined()
  })

  it('recollects when explicit refresh is requested', async () => {
    const cacheRoot = await root()
    await saveValidatedDeck('CODE1', deck, cards, { root: cacheRoot })
    const collect = vi.fn(async () => deck)
    await getOrCollectDeck('CODE1', collect, cards, {
      root: cacheRoot,
      refresh: true,
    })
    expect(collect).toHaveBeenCalledOnce()
  })
})
