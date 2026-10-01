import { randomUUID } from 'node:crypto'
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import type {
  TournamentEvent,
  TournamentEventFile,
  TournamentIndexFile,
  TournamentOshiMasterFile,
  TournamentPendingRecord,
} from '../../src/domain/tournaments/types'
import type { TournamentPublishedData } from '../../src/domain/tournaments/published'

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

export async function writeTournamentPublication(
  data: TournamentPublishedData,
  directory: string,
): Promise<void> {
  await rm(directory, { recursive: true, force: true })
  const eventDirectory = join(directory, 'events')
  await mkdir(eventDirectory, { recursive: true })
  await Promise.all([
    writeFile(join(directory, 'index.json'), json(data.index), 'utf8'),
    writeFile(
      join(directory, 'oshi-master.json'),
      json(data.oshiMaster),
      'utf8',
    ),
    ...Object.entries(data.events).map(([eventId, event]) =>
      writeFile(join(eventDirectory, `${eventId}.json`), json(event), 'utf8'),
    ),
  ])
}

function parseIndex(value: unknown): TournamentIndexFile {
  const index = value as Partial<TournamentIndexFile>
  if (
    index.format !== 'hlsieve-tournament-index' ||
    index.formatVersion !== 1 ||
    typeof index.dataVersion !== 'string' ||
    !Array.isArray(index.events)
  ) {
    throw new Error('Tournament index is invalid.')
  }
  return index as TournamentIndexFile
}

function parseEvent(value: unknown): TournamentEventFile {
  const file = value as Partial<TournamentEventFile>
  if (
    file.format !== 'hlsieve-tournament-event' ||
    file.formatVersion !== 1 ||
    typeof file.dataVersion !== 'string' ||
    !file.event ||
    typeof file.event.id !== 'string'
  ) {
    throw new Error('Tournament event file is invalid.')
  }
  return file as TournamentEventFile
}

function parseOshiMaster(value: unknown): TournamentOshiMasterFile {
  const file = value as Partial<TournamentOshiMasterFile>
  if (
    file.format !== 'hlsieve-tournament-oshi-master' ||
    file.formatVersion !== 1 ||
    typeof file.cardsDataVersion !== 'string' ||
    !file.cards ||
    typeof file.cards !== 'object'
  ) {
    throw new Error('Tournament Oshi master is invalid.')
  }
  return file as TournamentOshiMasterFile
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown
}

export async function validateTournamentPublicationDirectory(
  directory: string,
): Promise<void> {
  const index = parseIndex(await readJson(join(directory, 'index.json')))
  parseOshiMaster(await readJson(join(directory, 'oshi-master.json')))
  const expectedFiles = new Set(index.events.map((event) => `${event.id}.json`))
  const actualFiles = new Set(await readdir(join(directory, 'events')))
  if (
    expectedFiles.size !== actualFiles.size ||
    [...expectedFiles].some((file) => !actualFiles.has(file))
  ) {
    throw new Error('Tournament event files do not match the index.')
  }
  for (const summary of index.events) {
    const event = parseEvent(
      await readJson(join(directory, 'events', `${summary.id}.json`)),
    )
    if (
      event.event.id !== summary.id ||
      event.dataVersion !== index.dataVersion ||
      event.event.results.length !== summary.resultCount
    ) {
      throw new Error(`Tournament event does not match index: ${summary.id}`)
    }
  }
}

export async function publishTournamentPublication(
  stagingDirectory: string,
  destinationDirectory: string,
): Promise<void> {
  const parent = dirname(destinationDirectory)
  const id = randomUUID()
  const candidate = join(
    parent,
    `.${basename(destinationDirectory)}.${id}.candidate`,
  )
  const backup = join(parent, `.${basename(destinationDirectory)}.${id}.backup`)
  let movedExisting = false
  let installedCandidate = false
  await mkdir(parent, { recursive: true })
  try {
    await cp(stagingDirectory, candidate, {
      recursive: true,
      errorOnExist: true,
    })
    await validateTournamentPublicationDirectory(candidate)
    try {
      await rename(destinationDirectory, backup)
      movedExisting = true
    } catch {
      // The first publication has no destination directory.
    }
    await rename(candidate, destinationDirectory)
    installedCandidate = true
    if (movedExisting) await rm(backup, { recursive: true, force: true })
  } catch (error) {
    if (installedCandidate) {
      await rm(destinationDirectory, { recursive: true, force: true })
    }
    if (movedExisting) await rename(backup, destinationDirectory)
    throw error
  } finally {
    await rm(candidate, { recursive: true, force: true })
    await rm(backup, { recursive: true, force: true })
  }
}

export async function loadPublishedTournamentEvents(
  directory: string,
): Promise<TournamentEvent[]> {
  try {
    const index = parseIndex(await readJson(join(directory, 'index.json')))
    return Promise.all(
      index.events.map(
        async ({ id }) =>
          parseEvent(await readJson(join(directory, 'events', `${id}.json`)))
            .event,
      ),
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

export async function writeTournamentPendingRecords(
  records: readonly TournamentPendingRecord[],
  directory: string,
  lastAttemptAt: string,
): Promise<void> {
  await mkdir(directory, { recursive: true })
  await Promise.all(
    records.map((record) =>
      writeFile(
        join(directory, `${record.id}.json`),
        json({ ...record, lastAttemptAt }),
        'utf8',
      ),
    ),
  )
}
