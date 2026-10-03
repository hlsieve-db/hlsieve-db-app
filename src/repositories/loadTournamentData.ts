import type {
  TournamentEventFile,
  TournamentIndexFile,
  TournamentOshiMasterFile,
  TournamentResultCoverage,
} from '../domain/tournaments/types'

const TOURNAMENT_INDEX_URL = '/tournaments/index.json'
const TOURNAMENT_OSHI_MASTER_URL = '/tournaments/oshi-master.json'
const TOURNAMENT_EVENT_ROOT = '/tournaments/events/'

type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value)
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }
  const date = new Date(`${value}T00:00:00Z`)
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  )
}

function isCoverage(value: unknown): value is TournamentResultCoverage {
  if (!isRecord(value)) return false
  if (value.kind === 'winner-only' || value.kind === 'variable') return true
  return (
    value.kind === 'exact' &&
    Number.isSafeInteger(value.maxRank) &&
    (value.maxRank as number) >= 1
  )
}

function isSeries(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.type) &&
    isString(value.seriesName) &&
    isOptionalString(value.round)
  )
}

function isVenue(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.slug) &&
    isString(value.name) &&
    isOptionalString(value.prefecture)
  )
}

function isIndexResult(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    Number.isSafeInteger(value.rank) &&
    (value.rank as number) >= 1 &&
    isString(value.oshiCardNumber)
  )
}

function isIndexEvent(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isIsoDate(value.date) &&
    isSeries(value.tournament) &&
    isVenue(value.venue) &&
    (value.participantCount === undefined ||
      (Number.isSafeInteger(value.participantCount) &&
        (value.participantCount as number) >= 1)) &&
    isCoverage(value.resultCoverage) &&
    Number.isSafeInteger(value.resultCount) &&
    (value.resultCount as number) >= 0 &&
    Array.isArray(value.results) &&
    value.results.every(isIndexResult) &&
    value.resultCount === value.results.length
  )
}

function isDeckEntry(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.cardNumber) &&
    Number.isSafeInteger(value.quantity) &&
    (value.quantity as number) >= 1
  )
}

function isDeck(value: unknown): boolean {
  return (
    isRecord(value) &&
    Array.isArray(value.oshi) &&
    value.oshi.every(isDeckEntry) &&
    Array.isArray(value.main) &&
    value.main.every(isDeckEntry) &&
    Array.isArray(value.cheer) &&
    value.cheer.every(isDeckEntry)
  )
}

function isResult(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    Number.isSafeInteger(value.rank) &&
    (value.rank as number) >= 1 &&
    isString(value.oshiCardNumber) &&
    isOptionalString(value.deckLogCode) &&
    isDeck(value.deck)
  )
}

function isSource(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.sourceType) &&
    isOptionalString(value.sourceEventId) &&
    isOptionalString(value.sourceUrl)
  )
}

function isEvent(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isSeries(value.tournament) &&
    isIsoDate(value.date) &&
    isVenue(value.venue) &&
    (value.participantCount === undefined ||
      (Number.isSafeInteger(value.participantCount) &&
        (value.participantCount as number) >= 1)) &&
    isCoverage(value.resultCoverage) &&
    Array.isArray(value.results) &&
    value.results.every(isResult) &&
    new Set(value.results.map((result) => result.id)).size ===
      value.results.length &&
    isSource(value.source)
  )
}

export function isTournamentEventFile(
  value: unknown,
): value is TournamentEventFile {
  return (
    isRecord(value) &&
    value.format === 'hlsieve-tournament-event' &&
    value.formatVersion === 1 &&
    isString(value.dataVersion) &&
    isEvent(value.event)
  )
}

export function isTournamentIndexFile(
  value: unknown,
): value is TournamentIndexFile {
  return (
    isRecord(value) &&
    value.format === 'hlsieve-tournament-index' &&
    value.formatVersion === 1 &&
    isString(value.dataVersion) &&
    isIsoDate(value.startDate) &&
    Array.isArray(value.events) &&
    value.events.every(isIndexEvent) &&
    new Set(value.events.map((event) => event.id)).size === value.events.length
  )
}

export function isTournamentOshiMasterFile(
  value: unknown,
): value is TournamentOshiMasterFile {
  if (
    !isRecord(value) ||
    value.format !== 'hlsieve-tournament-oshi-master' ||
    value.formatVersion !== 1 ||
    !isString(value.cardsDataVersion) ||
    !isRecord(value.cards)
  ) {
    return false
  }
  return Object.entries(value.cards).every(
    ([cardNumber, card]) =>
      isString(cardNumber) &&
      isRecord(card) &&
      isString(card.name) &&
      isOptionalString(card.representativeImageUrl),
  )
}

async function loadJson(
  fetchData: typeof fetch,
  url: string,
  allowMissing: boolean,
): Promise<unknown | undefined> {
  let response: Response
  try {
    response = await fetchData(url)
  } catch (error) {
    throw new Error('Failed to fetch tournament data.', { cause: error })
  }
  if (allowMissing && response.status === 404) return undefined
  if (!response.ok) {
    throw new Error(`Failed to load tournament data: HTTP ${response.status}.`)
  }
  try {
    return await response.json()
  } catch (error) {
    throw new Error('Tournament data is not valid JSON.', { cause: error })
  }
}

export class TournamentDataHttpError extends Error {
  constructor(public readonly status: number) {
    super(`Failed to load tournament data: HTTP ${status}.`)
  }
}

export function createTournamentDataLoaders(fetchData: typeof fetch = fetch) {
  let indexCache: Promise<TournamentIndexFile | undefined> | undefined
  let oshiCache: Promise<TournamentOshiMasterFile> | undefined
  const eventCache = new Map<string, Promise<TournamentEventFile>>()

  const loadTournamentIndex = () => {
    if (indexCache) return indexCache
    const request = (async () => {
      const value = await loadJson(fetchData, TOURNAMENT_INDEX_URL, true)
      if (value === undefined) return undefined
      if (!isTournamentIndexFile(value)) {
        throw new Error('Tournament index has an invalid shape.')
      }
      return value
    })()
    indexCache = request
    void request.catch(() => {
      if (indexCache === request) indexCache = undefined
    })
    return request
  }

  const loadTournamentOshiMaster = () => {
    if (oshiCache) return oshiCache
    const request = (async () => {
      const value = await loadJson(fetchData, TOURNAMENT_OSHI_MASTER_URL, false)
      if (!isTournamentOshiMasterFile(value)) {
        throw new Error('Tournament Oshi master has an invalid shape.')
      }
      return value
    })()
    oshiCache = request
    void request.catch(() => {
      if (oshiCache === request) oshiCache = undefined
    })
    return request
  }

  const loadTournamentEvent = (eventId: string) => {
    const cached = eventCache.get(eventId)
    if (cached) return cached
    const request = (async () => {
      const url = `${TOURNAMENT_EVENT_ROOT}${encodeURIComponent(eventId)}.json`
      let response: Response
      try {
        response = await fetchData(url)
      } catch (error) {
        throw new Error('Failed to fetch tournament data.', { cause: error })
      }
      if (!response.ok) throw new TournamentDataHttpError(response.status)
      let value: unknown
      try {
        value = await response.json()
      } catch (error) {
        throw new Error('Tournament data is not valid JSON.', { cause: error })
      }
      if (!isTournamentEventFile(value)) {
        throw new Error('Tournament event has an invalid shape.')
      }
      if (value.event.id !== eventId) {
        throw new Error('Tournament event ID does not match the request.')
      }
      return value
    })()
    eventCache.set(eventId, request)
    void request.catch(() => {
      if (eventCache.get(eventId) === request) eventCache.delete(eventId)
    })
    return request
  }

  return { loadTournamentIndex, loadTournamentOshiMaster, loadTournamentEvent }
}

const loaders = createTournamentDataLoaders()
export const loadTournamentIndex = loaders.loadTournamentIndex
export const loadTournamentOshiMaster = loaders.loadTournamentOshiMaster
export const loadTournamentEvent = loaders.loadTournamentEvent
