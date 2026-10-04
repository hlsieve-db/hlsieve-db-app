import { createDeck } from '../decks/deck'
import type { Deck, DeckEntry } from '../decks/types'
import { getTournamentRegulationId } from './constants'
import type { TournamentDeck, TournamentEvent, TournamentResult } from './types'

export function flattenTournamentDeck(deck: TournamentDeck): DeckEntry[] {
  return [...deck.oshi, ...deck.main, ...deck.cheer].map((entry) => ({
    ...entry,
  }))
}

export type TournamentDeckConversionOptions = {
  id?: () => string
  now?: () => string
  name?: string
}

export function convertTournamentResultToDeck(
  event: TournamentEvent,
  result: TournamentResult,
  options: TournamentDeckConversionOptions = {},
): Deck {
  const deck = createDeck({
    id: options.id,
    now: options.now,
    name:
      options.name ??
      `${event.tournament.seriesName} ${event.date} ${result.rank}位`,
  })
  const regulationId = getTournamentRegulationId(
    event.tournament.type,
    event.tournament.environment,
  )
  return {
    ...deck,
    entries: flattenTournamentDeck(result.deck),
    ...(regulationId ? { regulationId } : {}),
  }
}
