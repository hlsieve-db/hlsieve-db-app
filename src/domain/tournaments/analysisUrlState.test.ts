import { describe, expect, it } from 'vitest'

import {
  hasInvalidTournamentAnalysisDateRange,
  parseTournamentAnalysisUrlState,
  serializeTournamentAnalysisUrlState,
} from './analysisUrlState'

describe('Tournament analysis URL state', () => {
  it('parses type, round, no-round and inclusive date values', () => {
    expect(
      parseTournamentAnalysisUrlState(
        '?type=selectioncup&round=bp08&from=2026-09-19&to=2026-10-31',
      ),
    ).toEqual({
      type: 'selectioncup',
      round: 'bp08',
      from: '2026-09-19',
      to: '2026-10-31',
    })
    expect(
      parseTournamentAnalysisUrlState('?type=bloomcup&round=none'),
    ).toEqual({
      type: 'bloomcup',
      round: null,
    })
  })

  it('ignores unknown keys, invalid dates, and round without type', () => {
    expect(
      parseTournamentAnalysisUrlState(
        '?round=bp08&from=2026-02-30&unknown=value',
      ),
    ).toEqual({})
  })

  it('omits defaults and serializes no-round as none', () => {
    expect(serializeTournamentAnalysisUrlState({}).toString()).toBe('')
    expect(
      serializeTournamentAnalysisUrlState({
        type: 'bloomcup',
        round: null,
      }).toString(),
    ).toBe('type=bloomcup&round=none')
  })

  it('detects a reversed range without changing it', () => {
    const state = parseTournamentAnalysisUrlState(
      '?from=2026-10-01&to=2026-09-01',
    )
    expect(hasInvalidTournamentAnalysisDateRange(state)).toBe(true)
    expect(serializeTournamentAnalysisUrlState(state).toString()).toBe(
      'from=2026-10-01&to=2026-09-01',
    )
  })
})
