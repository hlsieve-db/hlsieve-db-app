import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

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

const PRIVATE_PUBLICATION_PATTERN =
  /playerName|address|submitter|attemptCount|leaseUntil|lastErrorCode|nextAttemptAt|\.cache|[A-Z]:\\|diagnostic/i

export function validateTournamentPublicationPrivacy(text: string): void {
  if (PRIVATE_PUBLICATION_PATTERN.test(text)) {
    throw new Error('Tournament publication privacy validation failed.')
  }
}

export async function publishReadyTournamentEvents(options: {
  sourceEventIds: readonly string[]
  write: boolean
  queue: LocalTournamentQueueRepository
  artifacts: TournamentReadyArtifactRepository
  cardsData: CardsDataFile
  publicDirectory?: string
  stagingDirectory?: string
}): Promise<
  ReadyPublicationSummary & {
    publishedEventIds: Record<string, string>
    datasetVersion: string
  }
> {
  const uniqueIds = [...new Set(options.sourceEventIds)]
  if (uniqueIds.length !== options.sourceEventIds.length) {
    throw new Error('Daily publication contains duplicate source Event IDs.')
  }
  const queue = await options.queue.load()
  const records = new Map(
    queue.records.map((record) => [record.sourceEventId, record]),
  )
  const artifacts = await Promise.all(
    uniqueIds.map(async (sourceEventId) => {
      const record = records.get(sourceEventId)
      if (
        record?.status !== 'ready' ||
        record.leaseUntil ||
        record.lastErrorCode
      ) {
        throw new Error(
          `Queue Event is not publication-ready: ${sourceEventId}`,
        )
      }
      return options.artifacts.load(sourceEventId, options.cardsData)
    }),
  )
  const publicDirectory =
    options.publicDirectory ?? resolve('public/tournaments')
  const existing = await loadPublishedTournamentEvents(publicDirectory)
  const merged = mergeTournamentEvents(
    existing,
    artifacts.map(({ event }) => event),
  )
  if (merged.pending.length > 0)
    throw new Error('Publication merge produced pending conflicts.')
  const published = createTournamentPublishedData(
    merged.events,
    options.cardsData.cards,
    options.cardsData.dataVersion,
  )
  if (published.oshiMaster.cardsDataVersion !== options.cardsData.dataVersion) {
    throw new Error('Tournament Oshi master Card catalog version mismatch.')
  }
  const stagingDirectory =
    options.stagingDirectory ??
    resolve('.cache/tournaments/publication-preview/daily')
  await writeTournamentPublication(published, stagingDirectory)
  await validateTournamentPublicationDirectory(stagingDirectory)
  const files = await readdir(stagingDirectory, { recursive: true })
  const text = (
    await Promise.all(
      files
        .filter((file) => file.endsWith('.json'))
        .map((file) => readFile(join(stagingDirectory, file), 'utf8')),
    )
  ).join('\n')
  validateTournamentPublicationPrivacy(text)
  if (options.write)
    await publishTournamentPublication(stagingDirectory, publicDirectory)
  const publishedEventIds = Object.fromEntries(
    artifacts.map(({ event }) => [event.source.sourceEventId, event.id]),
  )
  return {
    sourceEventId: uniqueIds.join(','),
    write: options.write,
    eventAdded: merged.events.length - existing.length,
    resultAdded: artifacts.reduce(
      (sum, artifact) => sum + artifact.event.results.length,
      0,
    ),
    pending: 0,
    indexEvents: published.index.events.length,
    indexResults: published.index.events.reduce(
      (sum, event) => sum + event.resultCount,
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
    publishedEventIds,
    datasetVersion: published.index.dataVersion,
  }
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
