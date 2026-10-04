export type TournamentPlacementMaxRank = 8 | 16

export function getTournamentPlacementMaxRank(
  participantCount: number | undefined,
): TournamentPlacementMaxRank {
  if (
    participantCount === undefined ||
    !Number.isSafeInteger(participantCount) ||
    participantCount < 1 ||
    participantCount > 64
  ) {
    throw new Error(
      'Tournament participant count does not have a supported placement range.',
    )
  }
  return participantCount <= 32 ? 8 : 16
}

export function selectTournamentPlacementResults<T extends { rank: number }>(
  results: readonly T[],
  participantCount: number | undefined,
): T[] {
  const maxRank = getTournamentPlacementMaxRank(participantCount)
  return results.filter((result) => result.rank >= 1 && result.rank <= maxRank)
}
