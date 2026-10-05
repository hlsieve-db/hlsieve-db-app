import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { hostname as systemHostname } from 'node:os'

import {
  claimDueTournament,
  claimDueTournamentById,
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
export const TOURNAMENT_QUEUE_LOCK_TTL_MS = 30 * 60 * 1_000
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
  'eventDate',
  'eventDateSource',
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

export class TournamentQueueLockCorruptError extends Error {
  readonly code = 'lock-corrupt'
}

export type TournamentQueueLockMetadata = {
  format: 'hlsieve-tournament-queue-lock'
  formatVersion: 1
  pid: number
  acquiredAt: string
  hostname: string
}

export type TournamentQueueLockDiagnosis = {
  metadata?: TournamentQueueLockMetadata
  state:
    'absent' | 'active-local' | 'stale-candidate' | 'foreign-host' | 'corrupt'
  ageMs?: number
}

function lockPath(queuePath: string): string {
  return `${queuePath}.lock`
}

export function parseTournamentQueueLock(
  value: unknown,
): TournamentQueueLockMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TournamentQueueLockCorruptError(
      'Tournament queue lock is invalid.',
    )
  }
  const input = value as Record<string, unknown>
  if (
    Object.keys(input).some(
      (key) =>
        !['format', 'formatVersion', 'pid', 'acquiredAt', 'hostname'].includes(
          key,
        ),
    ) ||
    input.format !== 'hlsieve-tournament-queue-lock' ||
    input.formatVersion !== 1 ||
    !Number.isSafeInteger(input.pid) ||
    (input.pid as number) < 1 ||
    !isIso(input.acquiredAt) ||
    typeof input.hostname !== 'string' ||
    input.hostname.length === 0
  ) {
    throw new TournamentQueueLockCorruptError(
      'Tournament queue lock schema is invalid.',
    )
  }
  return input as TournamentQueueLockMetadata
}

export async function diagnoseTournamentQueueLock(
  queuePath: string,
  options: {
    now?: string
    hostname?: string
    pidExists?: (pid: number) => boolean
    ttlMs?: number
  } = {},
): Promise<TournamentQueueLockDiagnosis> {
  let text: string
  try {
    text = await readFile(lockPath(queuePath), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { state: 'absent' }
    }
    throw error
  }
  let metadata: TournamentQueueLockMetadata
  try {
    metadata = parseTournamentQueueLock(JSON.parse(text) as unknown)
  } catch {
    return { state: 'corrupt' }
  }
  const now = options.now ?? new Date().toISOString()
  if (!isIso(now))
    throw new Error('Lock diagnosis now must be an ISO timestamp.')
  const ageMs = Date.parse(now) - Date.parse(metadata.acquiredAt)
  const currentHostname = options.hostname ?? systemHostname()
  if (metadata.hostname !== currentHostname) {
    return { metadata, state: 'foreign-host', ageMs }
  }
  const pidExists =
    options.pidExists ??
    ((pid: number) => {
      try {
        process.kill(pid, 0)
        return true
      } catch {
        return false
      }
    })
  const stale =
    ageMs > (options.ttlMs ?? TOURNAMENT_QUEUE_LOCK_TTL_MS) &&
    !pidExists(metadata.pid)
  return {
    metadata,
    state: stale ? 'stale-candidate' : 'active-local',
    ageMs,
  }
}

export async function forceUnlockTournamentQueue(
  queuePath: string,
  options: Parameters<typeof diagnoseTournamentQueueLock>[1] & {
    force: boolean
  },
): Promise<TournamentQueueLockDiagnosis> {
  const diagnosis = await diagnoseTournamentQueueLock(queuePath, options)
  if (!options.force)
    throw new Error('Tournament queue unlock requires --force.')
  if (diagnosis.state === 'active-local') {
    throw new TournamentQueueLeaseConflictError(
      'Refusing to unlock a queue held by a possibly active local process.',
    )
  }
  if (diagnosis.state !== 'absent') {
    await rm(lockPath(queuePath), { force: true })
  }
  return diagnosis
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

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  )
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
    !(
      (input.eventDate === undefined && input.eventDateSource === undefined) ||
      (isDate(input.eventDate) &&
        input.eventDateSource === 'bushi-navi-public-browser-dom')
    ) ||
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
  lockIdentity?: { pid: number; hostname: string; now: () => string }
}

export class LocalTournamentQueueRepository {
  readonly path: string
  private readonly replaceFile: (
    temporaryPath: string,
    targetPath: string,
  ) => Promise<void>
  private readonly lockIdentity: {
    pid: number
    hostname: string
    now: () => string
  }

  constructor(options: TournamentQueueRepositoryOptions = {}) {
    this.path = options.path ?? DEFAULT_QUEUE_PATH
    this.replaceFile = options.replaceFile ?? rename
    this.lockIdentity = options.lockIdentity ?? {
      pid: process.pid,
      hostname: systemHostname(),
      now: () => new Date().toISOString(),
    }
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

  async claimDueById(
    sourceEventId: string,
    now: string,
    leaseDurationMs: number,
  ): Promise<TournamentQueueRecord | undefined> {
    return this.withMutationLock(async () => {
      const result = claimDueTournamentById(
        await this.load(),
        sourceEventId,
        now,
        leaseDurationMs,
      )
      if (!result.record) return undefined
      await this.saveUnlocked(result.queue)
      return result.record
    })
  }

  async setOfficialEventDate(
    sourceEventId: string,
    eventDate: string,
  ): Promise<TournamentQueueRecord> {
    if (!isDate(eventDate)) {
      throw new Error('Tournament Event date must be YYYY-MM-DD.')
    }
    return this.withMutationLock(async () => {
      let updated: TournamentQueueRecord | undefined
      const queue = updateTournamentQueueRecord(
        await this.load(),
        sourceEventId,
        (record) => {
          updated = {
            ...record,
            eventDate,
            eventDateSource: 'bushi-navi-public-browser-dom',
          }
          return updated
        },
      )
      await this.saveUnlocked(queue)
      return updated!
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
    const targetLockPath = lockPath(this.path)
    let lock
    try {
      lock = await open(targetLockPath, 'wx')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new TournamentQueueLeaseConflictError(
          'Another Tournament queue processor holds the mutation lock.',
        )
      }
      throw error
    }
    try {
      const metadata: TournamentQueueLockMetadata = {
        format: 'hlsieve-tournament-queue-lock',
        formatVersion: 1,
        pid: this.lockIdentity.pid,
        acquiredAt: this.lockIdentity.now(),
        hostname: this.lockIdentity.hostname,
      }
      parseTournamentQueueLock(metadata)
      await lock.writeFile(`${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
      await lock.sync()
      return await action()
    } finally {
      await lock.close()
      await rm(targetLockPath, { force: true })
    }
  }
}
