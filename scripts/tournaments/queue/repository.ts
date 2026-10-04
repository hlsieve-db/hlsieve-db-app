import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

import {
  claimDueTournament,
  emptyTournamentQueue,
  enqueueTournament,
  type TournamentQueueFile,
  type TournamentQueueRecord,
  type TournamentQueueStatus,
  transitionTournamentQueueRecord,
  updateTournamentQueueRecord,
} from './queue'
import { parseTournamentSourceEventId } from './submission'

const DEFAULT_QUEUE_PATH = resolve('.cache/tournaments/queue/queue.json')
const QUEUE_STATUSES: readonly TournamentQueueStatus[] = [
  'queued',
  'collecting',
  'waiting-result',
  'ready',
  'published',
  'needs-review',
]
const RECORD_KEYS = new Set([
  'sourceEventId',
  'status',
  'firstSubmittedAt',
  'lastSubmittedAt',
  'attemptCount',
  'nextAttemptAt',
  'leaseUntil',
  'lastErrorCode',
  'publishedEventId',
])

export class TournamentQueueCorruptError extends Error {
  readonly code = 'queue-corrupt'
}

export class TournamentQueueLeaseConflictError extends Error {
  readonly code = 'lease-conflict'
}

function isIso(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  )
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === 'string' && value.length > 0)
}

function parseRecord(value: unknown): TournamentQueueRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TournamentQueueCorruptError('Tournament queue record is invalid.')
  }
  const input = value as Record<string, unknown>
  if ([...Object.keys(input)].some((key) => !RECORD_KEYS.has(key))) {
    throw new TournamentQueueCorruptError(
      'Tournament queue record has an unknown field.',
    )
  }
  let sourceEventId: string
  try {
    sourceEventId = parseTournamentSourceEventId(
      String(input.sourceEventId ?? ''),
    )
  } catch {
    throw new TournamentQueueCorruptError(
      'Tournament queue Event ID is invalid.',
    )
  }
  if (
    sourceEventId !== input.sourceEventId ||
    !QUEUE_STATUSES.includes(input.status as TournamentQueueStatus) ||
    !isIso(input.firstSubmittedAt) ||
    !isIso(input.lastSubmittedAt) ||
    !Number.isSafeInteger(input.attemptCount) ||
    (input.attemptCount as number) < 0 ||
    !(input.nextAttemptAt === undefined || isIso(input.nextAttemptAt)) ||
    !(input.leaseUntil === undefined || isIso(input.leaseUntil)) ||
    !optionalString(input.lastErrorCode) ||
    !optionalString(input.publishedEventId)
  ) {
    throw new TournamentQueueCorruptError(
      'Tournament queue record shape is invalid.',
    )
  }
  return { ...input } as TournamentQueueRecord
}

export function parseTournamentQueueFile(value: unknown): TournamentQueueFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TournamentQueueCorruptError('Tournament queue file is invalid.')
  }
  const input = value as Record<string, unknown>
  if (
    input.format !== 'hlsieve-tournament-queue' ||
    input.formatVersion !== 1 ||
    !Array.isArray(input.records)
  ) {
    throw new TournamentQueueCorruptError('Tournament queue schema is invalid.')
  }
  const records = input.records.map(parseRecord)
  if (
    new Set(records.map((record) => record.sourceEventId)).size !==
    records.length
  ) {
    throw new TournamentQueueCorruptError(
      'Tournament queue contains duplicate Events.',
    )
  }
  return { format: 'hlsieve-tournament-queue', formatVersion: 1, records }
}

export type TournamentQueueRepositoryOptions = {
  path?: string
  replaceFile?: (temporaryPath: string, targetPath: string) => Promise<void>
}

export class LocalTournamentQueueRepository {
  readonly path: string
  private readonly replaceFile: (
    temporaryPath: string,
    targetPath: string,
  ) => Promise<void>

  constructor(options: TournamentQueueRepositoryOptions = {}) {
    this.path = options.path ?? DEFAULT_QUEUE_PATH
    this.replaceFile = options.replaceFile ?? rename
  }

  async load(): Promise<TournamentQueueFile> {
    let text: string
    try {
      text = await readFile(this.path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return emptyTournamentQueue()
      }
      throw error
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text) as unknown
    } catch {
      throw new TournamentQueueCorruptError('Tournament queue JSON is invalid.')
    }
    return parseTournamentQueueFile(parsed)
  }

  async save(queue: TournamentQueueFile): Promise<void> {
    await this.withMutationLock(() => this.saveUnlocked(queue))
  }

  private async saveUnlocked(queue: TournamentQueueFile): Promise<void> {
    const validated = parseTournamentQueueFile(queue)
    await mkdir(dirname(this.path), { recursive: true })
    const temporaryPath = `${this.path}.${randomUUID()}.tmp`
    const file = await open(temporaryPath, 'wx')
    try {
      await file.writeFile(`${JSON.stringify(validated, null, 2)}\n`, 'utf8')
      await file.sync()
    } finally {
      await file.close()
    }
    try {
      await this.replaceFile(temporaryPath, this.path)
    } finally {
      await rm(temporaryPath, { force: true })
    }
  }

  async enqueue(input: string, now: string): Promise<TournamentQueueRecord> {
    return this.withMutationLock(async () => {
      const queue = enqueueTournament(await this.load(), input, now)
      await this.saveUnlocked(queue)
      return queue.records.find(
        (record) =>
          record.sourceEventId === parseTournamentSourceEventId(input),
      )!
    })
  }

  async claimDue(
    now: string,
    leaseDurationMs: number,
  ): Promise<TournamentQueueRecord | undefined> {
    return this.withMutationLock(async () => {
      const result = claimDueTournament(await this.load(), now, leaseDurationMs)
      if (!result.record) return undefined
      await this.saveUnlocked(result.queue)
      return result.record
    })
  }

  async transition(
    sourceEventId: string,
    status: TournamentQueueStatus,
    options: { errorCode?: string; publishedEventId?: string } = {},
  ): Promise<TournamentQueueRecord> {
    return this.withMutationLock(async () => {
      let updated: TournamentQueueRecord | undefined
      const queue = updateTournamentQueueRecord(
        await this.load(),
        sourceEventId,
        (record) => {
          updated = transitionTournamentQueueRecord(record, status, options)
          return updated
        },
      )
      await this.saveUnlocked(queue)
      return updated!
    })
  }

  private async withMutationLock<T>(action: () => Promise<T>): Promise<T> {
    await mkdir(dirname(this.path), { recursive: true })
    const lockPath = `${this.path}.lock`
    let lock
    try {
      lock = await open(lockPath, 'wx')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new TournamentQueueLeaseConflictError(
          'Another Tournament queue processor holds the mutation lock.',
        )
      }
      throw error
    }
    try {
      return await action()
    } finally {
      await lock.close()
      await rm(lockPath, { force: true })
    }
  }
}
