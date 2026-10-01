import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { CardsDataFile } from '../../src/domain/cards/types'
import { mergeTournamentEvents } from '../../src/domain/tournaments/merge'
import { normalizeTournamentImportPayload } from '../../src/domain/tournaments/normalize'
import { createTournamentPublishedData } from '../../src/domain/tournaments/published'
import { validateTournamentImportPayload } from '../../src/domain/tournaments/validation'
import {
  loadPublishedTournamentEvents,
  publishTournamentPublication,
  writeTournamentPendingRecords,
  writeTournamentPublication,
} from './publication'

const importPath = process.argv[2]
if (!importPath) {
  console.error('Usage: npm run tournaments:import -- <normalized-import.json>')
  process.exitCode = 2
} else {
  try {
    const [inputText, cardsText] = await Promise.all([
      readFile(resolve(importPath), 'utf8'),
      readFile(resolve('public/cards.json'), 'utf8'),
    ])
    const payload = normalizeTournamentImportPayload(
      JSON.parse(inputText) as unknown,
    )
    const cardsData = JSON.parse(cardsText) as CardsDataFile
    const publicDirectory = resolve('public/tournaments')
    const existing = await loadPublishedTournamentEvents(publicDirectory)
    const validated = validateTournamentImportPayload(payload, cardsData.cards)
    const merged = mergeTournamentEvents(existing, validated.events)
    const pending = [...validated.pending, ...merged.pending]
    await writeTournamentPendingRecords(
      pending,
      resolve('.cache/tournaments/pending'),
      payload.collectedAt,
    )
    if (merged.events.length === 0) {
      throw new Error('No valid Tournament Event is available to publish.')
    }
    const published = createTournamentPublishedData(
      merged.events,
      cardsData.cards,
      cardsData.dataVersion,
    )
    const stagingDirectory = resolve('.cache/tournaments/staging')
    await writeTournamentPublication(published, stagingDirectory)
    await publishTournamentPublication(stagingDirectory, publicDirectory)
    console.log(
      `Published ${merged.events.length} Tournament Event(s); ${pending.length} pending record(s).`,
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
