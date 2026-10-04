import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export type DailyPhase =
  | 'started'
  | 'collected'
  | 'staged'
  | 'written'
  | 'committed'
  | 'pushed'
  | 'production-verified'
  | 'complete'
  | 'failed'
export type DailyCheckpoint = {
  targetDate: string
  startedAt: string
  phase: DailyPhase
  processedIds: string[]
  readyIds: string[]
  waitingIds: string[]
  reviewIds: string[]
  publicationEventIds: string[]
  expectedDatasetVersion?: string
  gitCommitSha?: string
  productionStatus?: 'pending' | 'ok' | 'failed'
}

export async function writeDailyCheckpoint(
  checkpoint: DailyCheckpoint,
  root = resolve('.cache/tournaments/daily'),
): Promise<void> {
  const path = resolve(root, `${checkpoint.targetDate}.json`)
  const temporary = `${path}.${process.pid}.tmp`
  await mkdir(dirname(path), { recursive: true })
  await writeFile(temporary, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8')
  await rename(temporary, path)
}

export async function readDailyCheckpoint(
  targetDate: string,
  root = resolve('.cache/tournaments/daily'),
): Promise<DailyCheckpoint | undefined> {
  try {
    return JSON.parse(
      await readFile(resolve(root, `${targetDate}.json`), 'utf8'),
    ) as DailyCheckpoint
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}
