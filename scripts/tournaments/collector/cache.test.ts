import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Card } from '../../../src/domain/cards/types'
import type { TournamentDeck } from '../../../src/domain/tournaments/types'
import {
  COLLECTOR_PARSER_VERSION,
  getOrCollectDeck,
  loadCachedDeck,
  saveValidatedDeck,
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
