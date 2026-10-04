import { mkdir, open, readFile, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { hostname } from 'node:os'

export const DAILY_LOCK_PATH = resolve('.cache/tournaments/daily.lock')
export const DAILY_LOCK_TTL_MS = 6 * 60 * 60 * 1_000

export type DailyLockMetadata = {
  format: 'hlsieve-tournament-daily-lock'
  formatVersion: 1
  pid: number
  hostname: string
  acquiredAt: string
  targetDate: string
}

export async function acquireDailyLock(
  targetDate: string,
  options: {
    path?: string
    now?: string
    pid?: number
    hostname?: string
  } = {},
): Promise<() => Promise<void>> {
  const path = options.path ?? DAILY_LOCK_PATH
  await mkdir(dirname(path), { recursive: true })
  let handle
  try {
    handle = await open(path, 'wx')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(
        'Tournament Daily lock already exists; review it manually.',
        { cause: error },
      )
    }
    throw error
  }
  const metadata: DailyLockMetadata = {
    format: 'hlsieve-tournament-daily-lock',
    formatVersion: 1,
    pid: options.pid ?? process.pid,
    hostname: options.hostname ?? hostname(),
    acquiredAt: options.now ?? new Date().toISOString(),
    targetDate,
  }
  await handle.writeFile(`${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
  await handle.sync()
  await handle.close()
  return async () => {
    await rm(path, { force: true })
  }
}

export async function diagnoseDailyLock(
  options: {
    path?: string
    now?: string
    hostname?: string
    pidExists?: (pid: number) => boolean
    ttlMs?: number
  } = {},
): Promise<{
  state:
    'absent' | 'active-local' | 'stale-candidate' | 'foreign-host' | 'corrupt'
  metadata?: DailyLockMetadata
}> {
  const path = options.path ?? DAILY_LOCK_PATH
  let value: unknown
  try {
    value = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { state: 'absent' }
    return { state: 'corrupt' }
  }
  const metadata = value as DailyLockMetadata
  if (
    metadata.format !== 'hlsieve-tournament-daily-lock' ||
    metadata.formatVersion !== 1 ||
    !Number.isSafeInteger(metadata.pid) ||
    !metadata.hostname ||
    !Number.isFinite(Date.parse(metadata.acquiredAt)) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(metadata.targetDate)
  )
    return { state: 'corrupt' }
  if (metadata.hostname !== (options.hostname ?? hostname()))
    return { state: 'foreign-host', metadata }
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
  const age =
    Date.parse(options.now ?? new Date().toISOString()) -
    Date.parse(metadata.acquiredAt)
  return {
    state:
      age > (options.ttlMs ?? DAILY_LOCK_TTL_MS) && !pidExists(metadata.pid)
        ? 'stale-candidate'
        : 'active-local',
    metadata,
  }
}
