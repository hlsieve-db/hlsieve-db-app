import { TOURNAMENT_NO_ENVIRONMENT } from './ui'

export type TournamentAnalysisUrlState = {
  type?: string
  environment?: string | null
  from?: string
  to?: string
}

function trimmed(value: string | null): string | undefined {
  const result = value?.trim()
  return result ? result : undefined
}

function validDate(value: string | null): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : undefined
}

export function parseTournamentAnalysisUrlState(
  input: string | URLSearchParams,
): TournamentAnalysisUrlState {
  const params =
    typeof input === 'string'
      ? new URLSearchParams(input.startsWith('?') ? input.slice(1) : input)
      : input
  const type = trimmed(params.get('type'))
  const serializedEnvironment = type
    ? trimmed(params.get('environment'))
    : undefined
  return {
    ...(type ? { type } : {}),
    ...(serializedEnvironment
      ? {
          environment:
            serializedEnvironment === TOURNAMENT_NO_ENVIRONMENT
              ? null
              : serializedEnvironment,
        }
      : {}),
    ...(validDate(params.get('from'))
      ? { from: validDate(params.get('from')) }
      : {}),
    ...(validDate(params.get('to')) ? { to: validDate(params.get('to')) } : {}),
  }
}

export function serializeTournamentAnalysisUrlState(
  state: TournamentAnalysisUrlState,
): URLSearchParams {
  const params = new URLSearchParams()
  if (state.type) params.set('type', state.type)
  if (state.type && state.environment === null)
    params.set('environment', TOURNAMENT_NO_ENVIRONMENT)
  if (state.type && typeof state.environment === 'string')
    params.set('environment', state.environment)
  if (state.from) params.set('from', state.from)
  if (state.to) params.set('to', state.to)
  return params
}

export function hasInvalidTournamentAnalysisDateRange(
  state: TournamentAnalysisUrlState,
): boolean {
  return Boolean(state.from && state.to && state.from > state.to)
}
