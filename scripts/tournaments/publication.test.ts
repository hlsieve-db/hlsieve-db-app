import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { Card } from '../../src/domain/cards/types'
import { createTournamentPublishedData } from '../../src/domain/tournaments/published'
import type { TournamentEvent } from '../../src/domain/tournaments/types'
import {
  publishTournamentPublication,
  writeTournamentPublication,
} from './publication'

const cards: Card[] = [
  {
    cardNumber: 'OSHI',
    name: 'Oshi',
    cardType: 'oshi',
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
    searchText: 'oshi',
  },
]

const event: TournamentEvent = {
  id: 'evt-one',
  tournament: { type: 'bloomcup', seriesName: 'Bloom Cup' },
  date: '2026-09-19',
  venue: { slug: 'venue', name: 'Venue' },
  resultCoverage: { kind: 'winner-only' },
  results: [
    {
      id: 'res-one',
      rank: 1,
      oshiCardNumber: 'OSHI',
      deck: { oshi: [], main: [], cheer: [] },
    },
  ],
  source: { sourceType: 'fixture' },
}

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('atomic Tournament publication', () => {
  it('leaves the existing publication untouched when staging validation fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hlsieve-tournaments-'))
    temporaryDirectories.push(root)
    const destination = join(root, 'public', 'tournaments')
    const validStaging = join(root, 'valid')
    const invalidStaging = join(root, 'invalid')
    const existing = createTournamentPublishedData([event], cards, 'cards-v1')
    await writeTournamentPublication(existing, validStaging)
    await publishTournamentPublication(validStaging, destination)
    const before = await readFile(join(destination, 'index.json'), 'utf8')

    await writeTournamentPublication(existing, invalidStaging)
    await rm(join(invalidStaging, 'events', 'evt-one.json'))

    await expect(
      publishTournamentPublication(invalidStaging, destination),
    ).rejects.toThrow('do not match')
    expect(await readFile(join(destination, 'index.json'), 'utf8')).toBe(before)
    expect(
      await readFile(join(destination, 'events', 'evt-one.json'), 'utf8'),
    ).toContain('evt-one')
  })
})
