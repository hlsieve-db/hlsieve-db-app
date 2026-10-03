import type {
  TournamentEvent,
  TournamentIndexFile,
  TournamentOshiMasterFile,
  TournamentResult,
} from '../../domain/tournaments/types'
import type { TournamentPublishedData } from '../../domain/tournaments/published'

function result(
  event: string,
  rank: number,
  oshiCardNumber: string,
): TournamentResult {
  return {
    id: `synthetic-result-${event}-${rank}`,
    rank,
    oshiCardNumber,
    deckLogCode:
      event === 'b' && rank === 5 ? undefined : `SYNTH-${event}-${rank}`,
    deck: {
      oshi: [{ cardNumber: oshiCardNumber, quantity: 1 }],
      main: [{ cardNumber: `SYNTH-MAIN-${event}`, quantity: 50 }],
      cheer: [{ cardNumber: `SYNTH-CHEER-${event}`, quantity: 20 }],
    },
  }
}

export const SYNTHETIC_TOURNAMENT_EVENTS: readonly TournamentEvent[] = [
  {
    id: 'synthetic-event-a',
    tournament: {
      type: 'selectioncup',
      round: 'bp08',
      seriesName: 'Synthetic Selection Cup',
    },
    date: '2026-09-26',
    venue: {
      slug: 'synthetic-north-hall',
      name: 'Synthetic North Hall',
      prefecture: 'テスト県',
    },
    participantCount: 64,
    resultCoverage: { kind: 'exact', maxRank: 8 },
    results: Array.from({ length: 8 }, (_, index) =>
      result(
        'a',
        index + 1,
        index % 2 === 0 ? 'SYNTH-OSHI-001' : 'SYNTH-OSHI-002',
      ),
    ),
    source: { sourceType: 'synthetic-test-fixture' },
  },
  {
    id: 'synthetic-event-b',
    tournament: { type: 'bloomcup', seriesName: 'Synthetic Bloom Cup' },
    date: '2026-09-20',
    venue: { slug: 'synthetic-south-store', name: 'Synthetic South Store' },
    resultCoverage: { kind: 'variable' },
    results: [1, 2, 3, 5].map((rank) =>
      result('b', rank, rank === 5 ? 'SYNTH-OSHI-NO-IMAGE' : 'SYNTH-OSHI-001'),
    ),
    source: { sourceType: 'synthetic-test-fixture' },
  },
  {
    id: 'synthetic-event-c',
    tournament: { type: 'future-format', seriesName: 'Synthetic Future Event' },
    date: '2026-09-20',
    venue: {
      slug: 'synthetic-future-space',
      name: 'Synthetic Future Space With A Deliberately Long Venue Name',
    },
    resultCoverage: { kind: 'winner-only' },
    results: [result('c', 1, 'SYNTH-OSHI-002')],
    source: { sourceType: 'synthetic-test-fixture' },
  },
]

const dataVersion = 'synthetic-test-data-v1'

export const SYNTHETIC_TOURNAMENT_INDEX: TournamentIndexFile = {
  format: 'hlsieve-tournament-index',
  formatVersion: 1,
  dataVersion,
  startDate: '2026-09-19',
  events: SYNTHETIC_TOURNAMENT_EVENTS.map((event) => ({
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

export const SYNTHETIC_TOURNAMENT_OSHI_MASTER: TournamentOshiMasterFile = {
  format: 'hlsieve-tournament-oshi-master',
  formatVersion: 1,
  cardsDataVersion: 'synthetic-cards-v1',
  cards: {
    'SYNTH-OSHI-001': {
      name: 'Synthetic Oshi',
      representativeImageUrl: 'https://invalid.example/synthetic-oshi-1.webp',
    },
    'SYNTH-OSHI-002': {
      name: 'Synthetic Oshi',
      representativeImageUrl: 'https://invalid.example/synthetic-oshi-2.webp',
    },
    'SYNTH-OSHI-NO-IMAGE': { name: 'Synthetic Image Missing Oshi' },
  },
}

export const SYNTHETIC_TOURNAMENT_PUBLICATION: TournamentPublishedData = {
  index: SYNTHETIC_TOURNAMENT_INDEX,
  events: Object.fromEntries(
    SYNTHETIC_TOURNAMENT_EVENTS.map((event) => [
      event.id,
      {
        format: 'hlsieve-tournament-event' as const,
        formatVersion: 1 as const,
        dataVersion,
        event,
      },
    ]),
  ),
  oshiMaster: SYNTHETIC_TOURNAMENT_OSHI_MASTER,
}
