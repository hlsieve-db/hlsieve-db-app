import { parseTournamentSourceEventId } from './submission'

export type TournamentQueueStatus =
  | 'queued'
  | 'collecting'
  | 'waiting-result'
  | 'ready'
  | 'published'
  | 'needs-review'

export type TournamentQueueRecord = {
  sourceEventId: string
  eventDate?: string
  eventDateSource?: 'bushi-navi-public-browser-dom'
  status: TournamentQueueStatus
  firstSubmittedAt: string
  lastSubmittedAt: string
  attemptCount: number
  nextAttemptAt?: string
  leaseUntil?: string
  lastErrorCode?: string
  publishedEventId?: string
}

export type TournamentQueueFile = {
  format: 'hlsieve-tournament-queue'
  formatVersion: 1
  records: TournamentQueueRecord[]
}

export const WAITING_RESULT_DAY_OFFSETS = [0, 1, 3, 7, 14] as const

const TRANSITIONS: Record<
  TournamentQueueStatus,
  readonly TournamentQueueStatus[]
> = {
  queued: ['collecting'],
  collecting: ['waiting-result', 'ready', 'needs-review'],
  'waiting-result': ['collecting'],
  ready: ['published', 'needs-review'],
  published: ['queued'],
  'needs-review': ['queued'],
}

function iso(value: string, label: string): string {
  if (
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(`${label} must be an ISO timestamp.`)
  }
  return value
}

export function emptyTournamentQueue(): TournamentQueueFile {
  return { format: 'hlsieve-tournament-queue', formatVersion: 1, records: [] }
}

export function enqueueTournament(
  queue: TournamentQueueFile,
  input: string,
  now: string,
): TournamentQueueFile {
  const sourceEventId = parseTournamentSourceEventId(input)
  iso(now, 'now')
  const existing = queue.records.find(
    (record) => record.sourceEventId === sourceEventId,
  )
  if (!existing) {
    return {
      ...queue,
      records: [
        ...queue.records,
        {
          sourceEventId,
          status: 'queued',
          firstSubmittedAt: now,
          lastSubmittedAt: now,
          attemptCount: 0,
        },
      ],
    }
  }
  const resubmitted: TournamentQueueRecord = {
    ...existing,
    lastSubmittedAt: now,
  }
  if (existing.status === 'published' || existing.status === 'needs-review') {
    resubmitted.status = 'queued'
    delete resubmitted.nextAttemptAt
    delete resubmitted.leaseUntil
    delete resubmitted.lastErrorCode
  }
  return {
    ...queue,
    records: queue.records.map((record) =>
      record.sourceEventId === sourceEventId ? resubmitted : record,
    ),
  }
}

export function waitingResultAttemptAt(
  firstSubmittedAt: string,
  attemptIndex: number,
): string | undefined {
  iso(firstSubmittedAt, 'firstSubmittedAt')
  if (!Number.isSafeInteger(attemptIndex) || attemptIndex < 0) {
    throw new Error('attemptIndex must be a non-negative integer.')
  }
  const offset = WAITING_RESULT_DAY_OFFSETS[attemptIndex]
  if (offset === undefined) return undefined
  const date = new Date(firstSubmittedAt)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString()
}

export function transitionTournamentQueueRecord(
  record: TournamentQueueRecord,
  status: TournamentQueueStatus,
  options: { errorCode?: string; publishedEventId?: string } = {},
): TournamentQueueRecord {
  if (!TRANSITIONS[record.status].includes(status)) {
    throw new Error(
      `Invalid Tournament queue transition: ${record.status} -> ${status}`,
    )
  }
  const next = { ...record, status }
  if (status !== 'collecting') delete next.leaseUntil
  if (status === 'waiting-result') {
    const nextAttemptAt = waitingResultAttemptAt(
      record.firstSubmittedAt,
      record.attemptCount,
    )
    if (nextAttemptAt === undefined) {
      throw new Error('Tournament waiting-result retry schedule is exhausted.')
    }
    next.nextAttemptAt = nextAttemptAt
  } else {
    delete next.nextAttemptAt
  }
  if (status === 'needs-review') {
    if (!options.errorCode)
      throw new Error('needs-review requires an error code.')
    next.lastErrorCode = options.errorCode
  } else {
    delete next.lastErrorCode
  }
  if (status === 'published') {
    if (!options.publishedEventId) {
      throw new Error('published requires a published Event ID.')
    }
    next.publishedEventId = options.publishedEventId
  }
  return next
}

export function isTournamentQueueRecordDue(
  record: TournamentQueueRecord,
  now: string,
): boolean {
  if (record.status === 'queued') return true
  if (record.status === 'waiting-result') {
    return record.nextAttemptAt !== undefined && record.nextAttemptAt <= now
  }
  return (
    record.status === 'collecting' &&
    record.leaseUntil !== undefined &&
    record.leaseUntil <= now
  )
}

export function claimDueTournament(
  queue: TournamentQueueFile,
  now: string,
  leaseDurationMs: number,
): { queue: TournamentQueueFile; record?: TournamentQueueRecord } {
  iso(now, 'now')
  if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs <= 0) {
    throw new Error('leaseDurationMs must be a positive integer.')
  }
  const candidate = [...queue.records]
    .filter((record) => isTournamentQueueRecordDue(record, now))
    .sort(
      (left, right) =>
        left.firstSubmittedAt.localeCompare(right.firstSubmittedAt) ||
        left.sourceEventId.localeCompare(right.sourceEventId),
    )[0]
  if (!candidate) return { queue }
  const claimed: TournamentQueueRecord = {
    ...candidate,
    status: 'collecting',
    attemptCount: candidate.attemptCount + 1,
    leaseUntil: new Date(Date.parse(now) + leaseDurationMs).toISOString(),
  }
  delete claimed.nextAttemptAt
  delete claimed.lastErrorCode
  return {
    queue: {
      ...queue,
      records: queue.records.map((record) =>
        record.sourceEventId === claimed.sourceEventId ? claimed : record,
      ),
    },
    record: claimed,
  }
}

export function claimDueTournamentById(
  queue: TournamentQueueFile,
  sourceEventId: string,
  now: string,
  leaseDurationMs: number,
): { queue: TournamentQueueFile; record?: TournamentQueueRecord } {
  const parsedId = parseTournamentSourceEventId(sourceEventId)
  iso(now, 'now')
  if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs <= 0) {
    throw new Error('leaseDurationMs must be a positive integer.')
  }
  const candidate = queue.records.find(
    (record) =>
      record.sourceEventId === parsedId &&
      isTournamentQueueRecordDue(record, now),
  )
  if (!candidate) return { queue }
  const claimed: TournamentQueueRecord = {
    ...candidate,
    status: 'collecting',
    attemptCount: candidate.attemptCount + 1,
    leaseUntil: new Date(Date.parse(now) + leaseDurationMs).toISOString(),
  }
  delete claimed.nextAttemptAt
  delete claimed.lastErrorCode
  return {
    queue: {
      ...queue,
      records: queue.records.map((record) =>
        record.sourceEventId === parsedId ? claimed : record,
      ),
    },
    record: claimed,
  }
}

export function updateTournamentQueueRecord(
  queue: TournamentQueueFile,
  sourceEventId: string,
  update: (record: TournamentQueueRecord) => TournamentQueueRecord,
): TournamentQueueFile {
  let found = false
  const records = queue.records.map((record) => {
    if (record.sourceEventId !== sourceEventId) return record
    found = true
    const next = update(record)
    if (next.sourceEventId !== sourceEventId) {
      throw new Error('Tournament queue Event ID cannot change.')
    }
    return next
  })
  if (!found)
    throw new Error(`Tournament queue Event is missing: ${sourceEventId}`)
  return { ...queue, records }
}
