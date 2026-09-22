export type PlayOrder = 'first' | 'second'
export type InitiativeChoiceResult = 'won_choice' | 'lost_choice'
export type MatchResult = 'win' | 'loss' | 'draw'

export type TournamentRound = {
  /** What the reporter typed. The field is free text. */
  opponentOshiName?: string
  /**
   * Kept only when the name identified exactly one oshi card, and still
   * present on reports written before the field became free text, which is why
   * it is read for display even when there is no name.
   */
  opponentOshiCardNumber?: string
  playOrder?: PlayOrder
  initiativeChoiceResult?: InitiativeChoiceResult
  result?: MatchResult
}

export type TournamentReport = {
  tournamentName: string
  placement: string
  participantCount?: number
  eventDate?: string
  selfOshiName?: string
  selfOshiCardNumber?: string
  swissRounds: TournamentRound[]
  tournamentRounds: TournamentRound[]
}

export type TournamentResultSummary = {
  wins: number
  losses: number
  draws: number
  completedRounds: number
}
