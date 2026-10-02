import type { TournamentSeries } from '../../../src/domain/tournaments/types'

export type TournamentSeriesConfig = TournamentSeries & {
  seriesId: string
  year: number
}

export const TOURNAMENT_SERIES_CONFIGS: readonly TournamentSeriesConfig[] = [
  {
    seriesId: '3440',
    type: 'selectioncup',
    round: 'bp08',
    seriesName: '【ホロカ】先行開催！セレクションカップ（2026年9月）',
    year: 2026,
  },
  {
    seriesId: '3396',
    type: 'bloomcup',
    seriesName: '【ホロカ】ブルームカップ「響咲リオナ」 （2026年9月開催）',
    year: 2026,
  },
]

export function getTournamentSeriesConfig(
  seriesId: string,
): TournamentSeriesConfig {
  const config = TOURNAMENT_SERIES_CONFIGS.find(
    (candidate) => candidate.seriesId === seriesId,
  )
  if (!config) throw new Error(`Unsupported Tournament series: ${seriesId}`)
  return config
}
