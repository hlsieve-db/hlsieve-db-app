export type PlayOrder = 'first' | 'second'
export type InitiativeChoiceResult = 'won_choice' | 'lost_choice'
export type MatchResult = 'win' | 'loss' | 'draw'

export type TournamentRound = {
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
