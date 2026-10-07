import {
  enqueueTournament,
  type TournamentQueueFile,
  type TournamentQueueRecord,
} from '../queue/queue'
import {
  buildOfficialTournamentResultUrl,
  parseTournamentSourceEventId,
} from '../queue/submission'
import type { TournamentDiscoveryCandidate } from './types'

export type TournamentAutomatedIntakeRejection = {
  sourceEventId?: string
  reason: string
}

export type TournamentAutomatedIntakeResult = {
  candidateCount: number
  uniqueCandidateCount: number
  added: string[]
  existing: string[]
  rejected: TournamentAutomatedIntakeRejection[]
}

export type TournamentAutomatedIntakePlan = {
  queue: TournamentQueueFile
  result: TournamentAutomatedIntakeResult
}

function validateCandidate(candidate: TournamentDiscoveryCandidate): string {
  const sourceEventId = parseTournamentSourceEventId(candidate.sourceEventId)
  if (candidate.sourceUrl !== buildOfficialTournamentResultUrl(sourceEventId)) {
    throw new Error('Candidate source URL is not canonical.')
  }
  if (!/^\d+$/.test(candidate.seriesId)) {
    throw new Error('Candidate series ID is invalid.')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate.observedForDate)) {
    throw new Error('Candidate observation date is invalid.')
  }
  if (
    !Number.isFinite(Date.parse(candidate.discoveredAt)) ||
    new Date(candidate.discoveredAt).toISOString() !== candidate.discoveredAt
  ) {
    throw new Error('Candidate discovery timestamp is invalid.')
  }
  return sourceEventId
}

export function planAutomatedTournamentIntake(
  queue: TournamentQueueFile,
  candidates: readonly TournamentDiscoveryCandidate[],
  now: string,
): TournamentAutomatedIntakePlan {
  const existingRecords = new Map<string, TournamentQueueRecord>(
    queue.records.map((record) => [record.sourceEventId, record]),
  )
  const seen = new Set<string>()
  const uniqueCandidates: Array<{
    candidate: TournamentDiscoveryCandidate
    sourceEventId: string
  }> = []
  const rejected: TournamentAutomatedIntakeRejection[] = []

  for (const candidate of candidates) {
    let sourceEventId: string
    try {
      sourceEventId = validateCandidate(candidate)
    } catch (error) {
      rejected.push({
        sourceEventId: /^\d+$/.test(candidate.sourceEventId)
          ? candidate.sourceEventId
          : undefined,
        reason: error instanceof Error ? error.message : String(error),
      })
      continue
    }
    if (seen.has(sourceEventId)) continue
    seen.add(sourceEventId)
    uniqueCandidates.push({ candidate, sourceEventId })
  }

  const added: string[] = []
  const existing: string[] = []
  let next = queue
  for (const { sourceEventId } of uniqueCandidates) {
    if (existingRecords.has(sourceEventId)) {
      existing.push(sourceEventId)
      continue
    }
    next = enqueueTournament(next, sourceEventId, now)
    added.push(sourceEventId)
    existingRecords.set(
      sourceEventId,
      next.records.find((record) => record.sourceEventId === sourceEventId)!,
    )
  }

  return {
    queue: next,
    result: {
      candidateCount: candidates.length,
      uniqueCandidateCount: uniqueCandidates.length,
      added,
      existing,
      rejected,
    },
  }
}
