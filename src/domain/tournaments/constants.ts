export const TOURNAMENT_DATA_START_DATE = '2026-09-19'

export const KNOWN_TOURNAMENT_TYPES = {
  BLOOM_CUP: 'bloomcup',
  SELECTION_CUP: 'selectioncup',
  WGP: 'wgp',
} as const

export type TournamentRegulationMapping = {
  tournamentType: string
  environment: string
  regulationId: string
}

export const TOURNAMENT_REGULATION_MAPPINGS: readonly TournamentRegulationMapping[] =
  [
    {
      tournamentType: KNOWN_TOURNAMENT_TYPES.SELECTION_CUP,
      environment: 'bp09',
      regulationId: 'selection-cup-2026-autumn',
    },
  ]

export function getTournamentRegulationId(
  tournamentType: string,
  environment?: string,
): string | undefined {
  return TOURNAMENT_REGULATION_MAPPINGS.find(
    (mapping) =>
      mapping.tournamentType === tournamentType &&
      mapping.environment === environment,
  )?.regulationId
}
