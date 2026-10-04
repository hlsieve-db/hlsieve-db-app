import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import type { CardsDataFile } from '../../../src/domain/cards/types'
import type {
  TournamentEvent,
  TournamentImportPayload,
} from '../../../src/domain/tournaments/types'
import { validateTournamentImportPayload } from '../../../src/domain/tournaments/validation'

const FORMAT = 'hlsieve-tournament-ready-artifact'
const FORMAT_VERSION = 1
const VALIDATOR_VERSION = 1

export type TournamentReadyArtifact = {
  format: typeof FORMAT
  formatVersion: typeof FORMAT_VERSION
  validatorVersion: typeof VALIDATOR_VERSION
  sourceEventId: string
  collectedAt: string
  semanticHash: string
  payload: TournamentImportPayload
  event: TournamentEvent
}

function semanticHash(event: TournamentEvent): string {
  return createHash('sha256').update(JSON.stringify(event)).digest('hex')
}

export class TournamentReadyArtifactRepository {
  readonly directory: string

  constructor(directory = resolve('.cache/tournaments/ready')) {
    this.directory = directory
  }

  path(sourceEventId: string): string {
    if (!/^\d+$/.test(sourceEventId)) throw new Error('Invalid sourceEventId.')
    return resolve(this.directory, `${sourceEventId}.json`)
  }

  async save(
    sourceEventId: string,
    payload: TournamentImportPayload,
    cardsData: CardsDataFile,
  ): Promise<TournamentReadyArtifact> {
    const validated = validateTournamentImportPayload(payload, cardsData.cards)
    if (validated.events.length !== 1 || validated.pending.length !== 0) {
      throw new Error('Ready artifact payload is not fully valid.')
    }
    const event = validated.events[0]!
    if (event.source.sourceEventId !== sourceEventId) {
      throw new Error('Ready artifact sourceEventId does not match.')
    }
    const artifact: TournamentReadyArtifact = {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      validatorVersion: VALIDATOR_VERSION,
      sourceEventId,
      collectedAt: payload.collectedAt,
      semanticHash: semanticHash(event),
      payload,
      event,
    }
    const path = this.path(sourceEventId)
    const temporaryPath = `${path}.${process.pid}.tmp`
    await mkdir(dirname(path), { recursive: true })
    await writeFile(
      temporaryPath,
      `${JSON.stringify(artifact, null, 2)}\n`,
      'utf8',
    )
    await rename(temporaryPath, path)
    return this.load(sourceEventId, cardsData)
  }

  async load(
    sourceEventId: string,
    cardsData: CardsDataFile,
  ): Promise<TournamentReadyArtifact> {
    let candidate: unknown
    try {
      candidate = JSON.parse(await readFile(this.path(sourceEventId), 'utf8'))
    } catch (error) {
      throw new Error('Ready artifact is missing or corrupt.', { cause: error })
    }
    const artifact = candidate as Partial<TournamentReadyArtifact>
    if (
      artifact.format !== FORMAT ||
      artifact.formatVersion !== FORMAT_VERSION ||
      artifact.validatorVersion !== VALIDATOR_VERSION ||
      artifact.sourceEventId !== sourceEventId ||
      typeof artifact.collectedAt !== 'string' ||
      typeof artifact.semanticHash !== 'string' ||
      !artifact.payload
    ) {
      throw new Error('Ready artifact metadata is invalid.')
    }
    const validated = validateTournamentImportPayload(
      artifact.payload,
      cardsData.cards,
    )
    if (validated.events.length !== 1 || validated.pending.length !== 0) {
      throw new Error('Ready artifact no longer passes validation.')
    }
    const event = validated.events[0]!
    if (
      event.source.sourceEventId !== sourceEventId ||
      semanticHash(event) !== artifact.semanticHash ||
      JSON.stringify(event) !== JSON.stringify(artifact.event)
    ) {
      throw new Error('Ready artifact integrity check failed.')
    }
    return artifact as TournamentReadyArtifact
  }
}
