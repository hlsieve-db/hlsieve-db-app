import type {
  TournamentIndexFile,
  TournamentOshiMasterFile,
} from '../../../src/domain/tournaments/types'
import type { TournamentReadyArtifact } from '../queue/readyArtifact'
import type { ReadyPublicationSummary } from '../queue/publishReady'

export function recoverWrittenPublication(options: {
  artifacts: readonly TournamentReadyArtifact[]
  index: TournamentIndexFile
  oshiMaster: TournamentOshiMasterFile
  expectedDatasetVersion: string
}): ReadyPublicationSummary & {
  publishedEventIds: Record<string, string>
  datasetVersion: string
} {
  if (options.index.dataVersion !== options.expectedDatasetVersion) {
    throw new Error(
      'Written Tournament dataset version changed during recovery.',
    )
  }
  const indexIds = new Set(options.index.events.map((event) => event.id))
  const publishedEventIds = Object.fromEntries(
    options.artifacts.map((artifact) => {
      if (!indexIds.has(artifact.event.id)) {
        throw new Error(
          `Written Tournament Event is missing during recovery: ${artifact.event.id}`,
        )
      }
      return [artifact.sourceEventId, artifact.event.id]
    }),
  )
  return {
    sourceEventId: options.artifacts
      .map(({ sourceEventId }) => sourceEventId)
      .join(','),
    write: true,
    eventAdded: options.artifacts.length,
    resultAdded: options.artifacts.reduce(
      (total, { event }) => total + event.results.length,
      0,
    ),
    pending: 0,
    indexEvents: options.index.events.length,
    indexResults: options.index.events.reduce(
      (total, event) => total + event.resultCount,
      0,
    ),
    oshiMasterCards: Object.keys(options.oshiMaster.cards).length,
    generatedFiles: [],
    publishedEventIds,
    datasetVersion: options.index.dataVersion,
  }
}
