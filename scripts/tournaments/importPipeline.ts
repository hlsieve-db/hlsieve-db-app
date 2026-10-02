import { resolve } from 'node:path'

import type { CardsDataFile } from '../../src/domain/cards/types'
import { mergeTournamentEvents } from '../../src/domain/tournaments/merge'
import { normalizeTournamentImportPayload } from '../../src/domain/tournaments/normalize'
import { createTournamentPublishedData } from '../../src/domain/tournaments/published'
import type { TournamentImportPayload } from '../../src/domain/tournaments/types'
import { validateTournamentImportPayload } from '../../src/domain/tournaments/validation'
import {
  loadPublishedTournamentEvents,
  publishTournamentPublication,
  writeTournamentPendingRecords,
  writeTournamentPublication,
} from './publication'

export type TournamentImportPipelineOptions = {
  publicDirectory?: string
  pendingDirectory?: string
  stagingDirectory?: string
}

export async function runTournamentImportPipeline(
  input: TournamentImportPayload | unknown,
  cardsData: CardsDataFile,
  options: TournamentImportPipelineOptions = {},
): Promise<{ publishedEvents: number; pendingRecords: number }> {
  const payload = normalizeTournamentImportPayload(input)
  const publicDirectory =
    options.publicDirectory ?? resolve('public/tournaments')
  const existing = await loadPublishedTournamentEvents(publicDirectory)
  const validated = validateTournamentImportPayload(payload, cardsData.cards)
  const merged = mergeTournamentEvents(existing, validated.events)
  const pending = [...validated.pending, ...merged.pending]
  await writeTournamentPendingRecords(
    pending,
    options.pendingDirectory ?? resolve('.cache/tournaments/pending'),
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
  const stagingDirectory =
    options.stagingDirectory ?? resolve('.cache/tournaments/staging')
  await writeTournamentPublication(published, stagingDirectory)
  await publishTournamentPublication(stagingDirectory, publicDirectory)
  return {
    publishedEvents: merged.events.length,
    pendingRecords: pending.length,
  }
}
