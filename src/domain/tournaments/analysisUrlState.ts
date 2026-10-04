import { TOURNAMENT_NO_ROUND } from './ui'

export type TournamentAnalysisUrlState = {
  type?: string
  round?: string | null
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
  const serializedRound = type ? trimmed(params.get('round')) : undefined
  return {
    ...(type ? { type } : {}),
    ...(serializedRound
      ? {
          round:
            serializedRound === TOURNAMENT_NO_ROUND ? null : serializedRound,
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
  if (state.type && state.round === null)
    params.set('round', TOURNAMENT_NO_ROUND)
  if (state.type && typeof state.round === 'string')
    params.set('round', state.round)
  if (state.from) params.set('from', state.from)
  if (state.to) params.set('to', state.to)
  return params
}

export function hasInvalidTournamentAnalysisDateRange(
  state: TournamentAnalysisUrlState,
): boolean {
  return Boolean(state.from && state.to && state.from > state.to)
}
