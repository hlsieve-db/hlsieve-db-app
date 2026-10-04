import { describe, expect, it } from 'vitest'

import {
  hasInvalidTournamentAnalysisDateRange,
  parseTournamentAnalysisUrlState,
  serializeTournamentAnalysisUrlState,
} from './analysisUrlState'

describe('Tournament analysis URL state', () => {
  it('parses type, environment, no-environment and inclusive dates', () => {
    expect(
      parseTournamentAnalysisUrlState(
        '?type=selectioncup&environment=bp09&from=2026-09-19&to=2026-10-31',
      ),
    ).toEqual({
      type: 'selectioncup',
      environment: 'bp09',
      from: '2026-09-19',
      to: '2026-10-31',
    })
    expect(
      parseTournamentAnalysisUrlState('?type=bloomcup&environment=none'),
    ).toEqual({
      type: 'bloomcup',
      environment: null,
    })
  })

  it('ignores unknown keys, invalid dates, and environment without type', () => {
    expect(
      parseTournamentAnalysisUrlState(
        '?environment=bp09&from=2026-02-30&unknown=value',
      ),
    ).toEqual({})
  })

  it('omits defaults and serializes no-environment as none', () => {
    expect(serializeTournamentAnalysisUrlState({}).toString()).toBe('')
    expect(
      serializeTournamentAnalysisUrlState({
        type: 'bloomcup',
        environment: null,
      }).toString(),
    ).toBe('type=bloomcup&environment=none')
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
