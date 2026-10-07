import {
  appendFile,
  mkdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import type {
  TournamentDiscoveryObservation,
  TournamentDiscoveryQueryResult,
  TournamentDiscoveryRunResult,
} from './types'

function observationPath(root: string, seriesId: string, date: string): string {
  if (!/^\d+$/.test(seriesId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Invalid Discovery observation identity.')
  }
  return resolve(root, 'observations', seriesId, `${date}.json`)
}

async function readObservation(
  path: string,
): Promise<TournamentDiscoveryObservation | undefined> {
  try {
    return JSON.parse(
      await readFile(path, 'utf8'),
    ) as TournamentDiscoveryObservation
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

function mergeObservation(
  current: TournamentDiscoveryObservation | undefined,
  query: TournamentDiscoveryQueryResult,
): TournamentDiscoveryObservation {
  const success = query.outcome === 'observed' || query.outcome === 'saturated'
  return {
    seriesId: query.seriesId,
    date: query.date,
    lastAttemptAt: query.attemptedAt,
    lastSuccessAt: success ? query.attemptedAt : current?.lastSuccessAt,
    observedCount: success ? query.observedCount : current?.observedCount,
    discoveredIds: [
      ...new Set([...(current?.discoveredIds ?? []), ...query.candidateIds]),
    ],
    saturationObserved: Boolean(current?.saturationObserved || query.saturated),
    zeroResultObserved: Boolean(
      current?.zeroResultObserved || query.zeroResultObserved,
    ),
    lastOutcome: query.outcome,
    lastErrorCode: success ? undefined : query.errorCode,
    attemptCount: (current?.attemptCount ?? 0) + 1,
  }
}

export class TournamentDiscoveryObservationRepository {
  constructor(
    private readonly root = resolve('.cache/tournaments/discovery'),
  ) {}

  async saveRun(run: TournamentDiscoveryRunResult): Promise<void> {
    for (const query of run.queries) {
      const path = observationPath(this.root, query.seriesId, query.date)
      const observation = mergeObservation(await readObservation(path), query)
      const temporary = `${path}.${process.pid}.tmp`
      await mkdir(dirname(path), { recursive: true })
      await writeFile(
        temporary,
        `${JSON.stringify(observation, null, 2)}\n`,
        'utf8',
      )
      await rename(temporary, path)
    }
    const logPath = resolve(this.root, 'runs.jsonl')
    await mkdir(dirname(logPath), { recursive: true })
    await appendFile(logPath, `${JSON.stringify(run)}\n`, 'utf8')
  }

  async loadObservation(
    seriesId: string,
    date: string,
  ): Promise<TournamentDiscoveryObservation | undefined> {
    return readObservation(observationPath(this.root, seriesId, date))
  }
}
