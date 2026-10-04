import { describe, expect, it } from 'vitest'

import {
  hasInvalidTournamentDateRange,
  parseTournamentUrlState,
  serializeTournamentUrlState,
} from './tournamentUrlState'

describe('Tournament list URL state', () => {
  it('parses all supported query values and ignores unknown keys', () => {
    expect(
      parseTournamentUrlState(
        '?from=2026-09-19&to=2026-09-30&type=selectioncup&environment=bp09&oshi=A&venue=%E6%9D%B1%E4%BA%AC&sort=date-asc&page=2&unknown=x',
      ),
    ).toEqual({
      from: '2026-09-19',
      to: '2026-09-30',
      type: 'selectioncup',
      environment: 'bp09',
      oshi: 'A',
      venue: '東京',
      sort: 'date-asc',
      page: 2,
    })
  })

  it('drops invalid dates, sort and page values', () => {
    expect(
      parseTournamentUrlState('?from=2026-02-30&to=nope&sort=random&page=0'),
    ).toEqual({
      from: undefined,
      to: undefined,
      type: undefined,
      environment: undefined,
      oshi: undefined,
      venue: undefined,
      sort: 'date-desc',
      page: 1,
    })
  })

  it('omits defaults and retains reversed dates for validation', () => {
    const state = parseTournamentUrlState('?from=2026-09-30&to=2026-09-19')
    expect(hasInvalidTournamentDateRange(state)).toBe(true)
    expect(serializeTournamentUrlState(state).toString()).toBe(
      'from=2026-09-30&to=2026-09-19',
    )
  })
})
