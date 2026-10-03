import type {
  TournamentIndexFile,
  TournamentOshiMasterFile,
  TournamentResultCoverage,
} from '../domain/tournaments/types'

const TOURNAMENT_INDEX_URL = '/tournaments/index.json'
const TOURNAMENT_OSHI_MASTER_URL = '/tournaments/oshi-master.json'

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

export function createTournamentDataLoaders(fetchData: typeof fetch = fetch) {
  let indexCache: Promise<TournamentIndexFile | undefined> | undefined
  let oshiCache: Promise<TournamentOshiMasterFile> | undefined

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

  return { loadTournamentIndex, loadTournamentOshiMaster }
}

const loaders = createTournamentDataLoaders()
export const loadTournamentIndex = loaders.loadTournamentIndex
export const loadTournamentOshiMaster = loaders.loadTournamentOshiMaster
