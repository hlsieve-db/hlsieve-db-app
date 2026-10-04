import type { CardsDataFile } from '../../../src/domain/cards/types'
import type { TournamentImportEvent } from '../../../src/domain/tournaments/types'
import { validateTournamentImportPayload } from '../../../src/domain/tournaments/validation'
import { createCollectorPayload } from '../collector/collector'
import { KnownEventCollectionError } from '../collector/bushiNavi'
import { LocalTournamentQueueRepository } from './repository'
import { TournamentReadyArtifactRepository } from './readyArtifact'

export type TournamentQueueProcessorResult = {
  sourceEventId?: string
  status: 'idle' | 'ready' | 'waiting-result' | 'needs-review'
  errorCode?: string
}

export async function processOneTournamentQueueItem(options: {
  repository: LocalTournamentQueueRepository
  cardsData: CardsDataFile
  collect: (sourceEventId: string) => Promise<TournamentImportEvent>
  now: string
  leaseDurationMs: number
  readyArtifacts?: TournamentReadyArtifactRepository
}): Promise<TournamentQueueProcessorResult> {
  const claimed = await options.repository.claimDue(
    options.now,
    options.leaseDurationMs,
  )
  if (!claimed) return { status: 'idle' }
  let event: TournamentImportEvent
  try {
    event = await options.collect(claimed.sourceEventId)
  } catch (error) {
    const errorCode =
      error instanceof KnownEventCollectionError
        ? error.code
        : 'collector-failed'
    const status =
      errorCode === 'result-not-published' ? 'waiting-result' : 'needs-review'
    await options.repository.transition(claimed.sourceEventId, status, {
      ...(status === 'needs-review' ? { errorCode } : {}),
    })
    return {
      sourceEventId: claimed.sourceEventId,
      status,
      ...(status === 'needs-review' ? { errorCode } : {}),
    }
  }
  try {
    if (event.identity.sourceEventId !== claimed.sourceEventId) {
      throw new Error(
        'Collector Event identity does not match the claimed queue item.',
      )
    }
    const payload = createCollectorPayload([event], options.now)
    const validation = validateTournamentImportPayload(
      payload,
      options.cardsData.cards,
    )
    if (validation.events.length !== 1 || validation.pending.length > 0) {
      const errorCode = 'validation-failed'
      await options.repository.transition(
        claimed.sourceEventId,
        'needs-review',
        {
          errorCode,
        },
      )
      return {
        sourceEventId: claimed.sourceEventId,
        status: 'needs-review',
        errorCode,
      }
    }
    if (options.readyArtifacts) {
      await options.readyArtifacts.save(
        claimed.sourceEventId,
        payload,
        options.cardsData,
      )
    }
    await options.repository.transition(claimed.sourceEventId, 'ready')
    return { sourceEventId: claimed.sourceEventId, status: 'ready' }
  } catch (error) {
    const errorCode =
      error instanceof Error && error.message.includes('artifact')
        ? 'artifact-write-failed'
        : 'validation-failed'
    await options.repository.transition(claimed.sourceEventId, 'needs-review', {
      errorCode,
    })
    return {
      sourceEventId: claimed.sourceEventId,
      status: 'needs-review',
      errorCode,
    }
  }
}
