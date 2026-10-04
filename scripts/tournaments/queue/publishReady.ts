import { resolve } from 'node:path'

import type { CardsDataFile } from '../../../src/domain/cards/types'
import { mergeTournamentEvents } from '../../../src/domain/tournaments/merge'
import { createTournamentPublishedData } from '../../../src/domain/tournaments/published'
import {
  loadPublishedTournamentEvents,
  publishTournamentPublication,
  validateTournamentPublicationDirectory,
  writeTournamentPublication,
} from '../publication'
import { LocalTournamentQueueRepository } from './repository'
import { TournamentReadyArtifactRepository } from './readyArtifact'

export type ReadyPublicationSummary = {
  sourceEventId: string
  write: boolean
  eventAdded: number
  resultAdded: number
  pending: number
  indexEvents: number
  indexResults: number
  oshiMasterCards: number
  generatedFiles: string[]
}

export async function publishReadyTournamentEvent(options: {
  sourceEventId: string
  write: boolean
  queue: LocalTournamentQueueRepository
  artifacts: TournamentReadyArtifactRepository
  cardsData: CardsDataFile
  publicDirectory?: string
  stagingDirectory?: string
}): Promise<ReadyPublicationSummary> {
  const record = (await options.queue.load()).records.find(
    (candidate) => candidate.sourceEventId === options.sourceEventId,
  )
  if (
    record?.status !== 'ready' ||
    record.leaseUntil !== undefined ||
    record.lastErrorCode !== undefined
  ) {
    throw new Error('Queue Event is not publication-ready.')
  }
  const artifact = await options.artifacts.load(
    options.sourceEventId,
    options.cardsData,
  )
  const publicDirectory =
    options.publicDirectory ?? resolve('public/tournaments')
  const existing = await loadPublishedTournamentEvents(publicDirectory)
  const merged = mergeTournamentEvents(existing, [artifact.event])
  if (merged.pending.length > 0) {
    throw new Error('Publication merge produced pending conflicts.')
  }
  const published = createTournamentPublishedData(
    merged.events,
    options.cardsData.cards,
    options.cardsData.dataVersion,
  )
  const stagingDirectory =
    options.stagingDirectory ??
    resolve('.cache/tournaments/publication-preview', options.sourceEventId)
  await writeTournamentPublication(published, stagingDirectory)
  await validateTournamentPublicationDirectory(stagingDirectory)
  if (options.write) {
    await publishTournamentPublication(stagingDirectory, publicDirectory)
  }
  const previous = existing.find(
    (event) => event.source.sourceEventId === options.sourceEventId,
  )
  return {
    sourceEventId: options.sourceEventId,
    write: options.write,
    eventAdded: previous ? 0 : 1,
    resultAdded: previous ? 0 : artifact.event.results.length,
    pending: 0,
    indexEvents: published.index.events.length,
    indexResults: published.index.events.reduce(
      (count, event) => count + event.resultCount,
      0,
    ),
    oshiMasterCards: Object.keys(published.oshiMaster.cards).length,
    generatedFiles: [
      'public/tournaments/index.json',
      'public/tournaments/oshi-master.json',
      ...Object.keys(published.events).map(
        (eventId) => `public/tournaments/events/${eventId}.json`,
      ),
    ],
  }
}
