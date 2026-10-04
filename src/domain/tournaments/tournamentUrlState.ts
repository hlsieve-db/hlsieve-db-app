import { TOURNAMENT_NO_ENVIRONMENT, type TournamentSort } from './ui'

export type TournamentUrlState = {
  from?: string
  to?: string
  type?: string
  environment?: string
  oshi?: string
  venue?: string
  sort: TournamentSort
  page: number
}

export const DEFAULT_TOURNAMENT_URL_STATE: TournamentUrlState = {
  sort: 'date-desc',
  page: 1,
}

function validDate(value: string | null): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : undefined
}

function trimmed(value: string | null): string | undefined {
  const result = value?.trim()
  return result ? result : undefined
}

function pageNumber(value: string | null): number {
  if (!value || !/^[1-9]\d*$/.test(value)) return 1
  const page = Number(value)
  return Number.isSafeInteger(page) ? page : 1
}

export function parseTournamentUrlState(
  input: string | URLSearchParams,
): TournamentUrlState {
  const params =
    typeof input === 'string'
      ? new URLSearchParams(input.startsWith('?') ? input.slice(1) : input)
      : input
  const sort = params.get('sort') === 'date-asc' ? 'date-asc' : 'date-desc'
  const environment = trimmed(params.get('environment'))
  return {
    from: validDate(params.get('from')),
    to: validDate(params.get('to')),
    type: trimmed(params.get('type')),
    environment:
      environment === TOURNAMENT_NO_ENVIRONMENT
        ? TOURNAMENT_NO_ENVIRONMENT
        : environment,
    oshi: trimmed(params.get('oshi')),
    venue: trimmed(params.get('venue')),
    sort,
    page: pageNumber(params.get('page')),
  }
}

export function serializeTournamentUrlState(
  state: TournamentUrlState,
): URLSearchParams {
  const params = new URLSearchParams()
  if (state.from) params.set('from', state.from)
  if (state.to) params.set('to', state.to)
  if (state.type) params.set('type', state.type)
  if (state.environment) params.set('environment', state.environment)
  if (state.oshi) params.set('oshi', state.oshi)
  if (state.venue) params.set('venue', state.venue)
  if (state.sort !== 'date-desc') params.set('sort', state.sort)
  if (state.page !== 1) params.set('page', String(state.page))
  return params
}

export function hasInvalidTournamentDateRange(
  state: TournamentUrlState,
): boolean {
  return Boolean(state.from && state.to && state.from > state.to)
}
