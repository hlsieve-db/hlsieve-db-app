import { describe, expect, it } from 'vitest'

import { SYNTHETIC_TOURNAMENT_INDEX } from '../../test/fixtures/tournaments'
import {
  filterTournamentEvents,
  sortTournamentEvents,
  TOURNAMENT_NO_ENVIRONMENT,
  tournamentEnvironmentLabel,
  tournamentTypeLabel,
} from './ui'

describe('Tournament list domain helpers', () => {
  const events = SYNTHETIC_TOURNAMENT_INDEX.events

  it('filters dates, type, environment, Oshi card number and venue', () => {
    expect(filterTournamentEvents(events, { from: '2026-09-25' })).toHaveLength(
      1,
    )
    expect(filterTournamentEvents(events, { to: '2026-09-20' })).toHaveLength(2)
    expect(filterTournamentEvents(events, { type: 'bloomcup' })[0]?.id).toBe(
      'synthetic-event-b',
    )
    expect(filterTournamentEvents(events, { environment: 'bp09' })[0]?.id).toBe(
      'synthetic-event-a',
    )
    expect(
      filterTournamentEvents(events, {
        environment: TOURNAMENT_NO_ENVIRONMENT,
      }),
    ).toHaveLength(2)
    expect(
      filterTournamentEvents(events, { oshi: 'SYNTH-OSHI-NO-IMAGE' })[0]?.id,
    ).toBe('synthetic-event-b')
    expect(
      filterTournamentEvents(events, {
        venue: 'ＳＹＮＴＨＥＴＩＣ　ｆＵＴＵＲＥ',
      })[0]?.id,
    ).toBe('synthetic-event-c')
  })

  it('sorts both directions with event ID as the same-date tie-breaker', () => {
    expect(
      sortTournamentEvents(events, 'date-desc').map(({ id }) => id),
    ).toEqual(['synthetic-event-a', 'synthetic-event-b', 'synthetic-event-c'])
    expect(
      sortTournamentEvents([...events].reverse(), 'date-asc').map(
        ({ id }) => id,
      ),
    ).toEqual(['synthetic-event-b', 'synthetic-event-c', 'synthetic-event-a'])
  })

  it('uses safe labels for known and future tournament types', () => {
    expect(tournamentTypeLabel('selectioncup')).toBe('セレクションカップ')
    expect(tournamentTypeLabel('future-format')).toBe('その他')
    expect(tournamentEnvironmentLabel('bp09')).toBe('9弾')
  })
})
