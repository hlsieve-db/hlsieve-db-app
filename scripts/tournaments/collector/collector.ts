import type { CardsDataFile } from '../../../src/domain/cards/types'
import { normalizeTournamentImportPayload } from '../../../src/domain/tournaments/normalize'
import type {
  TournamentImportEvent,
  TournamentImportPayload,
} from '../../../src/domain/tournaments/types'
import { validateTournamentImportPayload } from '../../../src/domain/tournaments/validation'

export function createCollectorPayload(
  events: TournamentImportEvent[],
  collectedAt: string,
): TournamentImportPayload {
  return normalizeTournamentImportPayload({
    format: 'hlsieve-tournament-import',
    formatVersion: 1,
    collectedAt,
    collector: {
      type: 'bushi-navi-public-browser-dom',
      version: '1',
    },
    events,
  })
}

export type CollectorExecutionOptions = {
  dryRun: boolean
  collect: () => Promise<TournamentImportEvent[]>
  cardsData: CardsDataFile
  publish: (payload: TournamentImportPayload) => Promise<void>
  now?: () => string
}

export async function executeCollector(
  options: CollectorExecutionOptions,
): Promise<{
  payload: TournamentImportPayload
  validEvents: number
  pendingRecords: number
}> {
  const payload = createCollectorPayload(
    await options.collect(),
    (options.now ?? (() => new Date().toISOString()))(),
  )
  const validated = validateTournamentImportPayload(
    payload,
    options.cardsData.cards,
  )
  if (!options.dryRun) await options.publish(payload)
  return {
    payload,
    validEvents: validated.events.length,
    pendingRecords: validated.pending.length,
  }
}
