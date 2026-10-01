import type { Card } from '../cards/types'
import { TOURNAMENT_DATA_START_DATE } from './constants'
import { createSemanticDataVersion } from './ids'
import type {
  TournamentEvent,
  TournamentEventFile,
  TournamentIndexFile,
  TournamentOshiMasterFile,
} from './types'

export type TournamentPublishedData = {
  index: TournamentIndexFile
  events: Record<string, TournamentEventFile>
  oshiMaster: TournamentOshiMasterFile
}

export function createTournamentPublishedData(
  inputEvents: readonly TournamentEvent[],
  cards: readonly Card[],
  cardsDataVersion: string,
): TournamentPublishedData {
  const events = [...inputEvents].sort(
    (left, right) =>
      right.date.localeCompare(left.date) || left.id.localeCompare(right.id),
  )
  const dataVersion = createSemanticDataVersion(events)
  const index: TournamentIndexFile = {
    format: 'hlsieve-tournament-index',
    formatVersion: 1,
    dataVersion,
    startDate: TOURNAMENT_DATA_START_DATE,
    events: events.map((event) => ({
      id: event.id,
      tournament: event.tournament,
      date: event.date,
      venue: event.venue,
      participantCount: event.participantCount,
      resultCoverage: event.resultCoverage,
      resultCount: event.results.length,
      results: event.results.map(({ id, rank, oshiCardNumber }) => ({
        id,
        rank,
        oshiCardNumber,
      })),
    })),
  }
  const eventFiles = Object.fromEntries(
    events.map((event) => [
      event.id,
      {
        format: 'hlsieve-tournament-event' as const,
        formatVersion: 1 as const,
        dataVersion,
        event,
      },
    ]),
  )
  const cardsByNumber = new Map(cards.map((card) => [card.cardNumber, card]))
  const oshiNumbers = [
    ...new Set(
      events.flatMap((event) =>
        event.results.map((result) => result.oshiCardNumber),
      ),
    ),
  ].sort()
  const oshiCards: TournamentOshiMasterFile['cards'] = {}
  for (const cardNumber of oshiNumbers) {
    const card = cardsByNumber.get(cardNumber)
    if (!card) throw new Error(`Oshi card is missing: ${cardNumber}`)
    oshiCards[cardNumber] = {
      name: card.name,
      representativeImageUrl: card.representativeImageUrl,
    }
  }
  return {
    index,
    events: eventFiles,
    oshiMaster: {
      format: 'hlsieve-tournament-oshi-master',
      formatVersion: 1,
      cardsDataVersion,
      cards: oshiCards,
    },
  }
}
