import { describe, expect, it } from 'vitest'

import {
  findTournamentSeriesByPublicName,
  getTournamentSeriesConfig,
} from './seriesConfig'

describe('Tournament Collector series config', () => {
  it('maps the approved Selection Cup and Bloom Cup series', () => {
    expect(getTournamentSeriesConfig('3440')).toMatchObject({
      type: 'selectioncup',
      round: 'bp08',
      year: 2026,
    })
    const bloom = getTournamentSeriesConfig('3396')
    expect(bloom).toMatchObject({
      type: 'bloomcup',
      year: 2026,
    })
    expect(bloom).not.toHaveProperty('round')
  })
})

describe('public series name mapping', () => {
  it('normalizes whitespace but requires an exact full name', () => {
    expect(
      findTournamentSeriesByPublicName(
        '  【ホロカ】先行開催！セレクションカップ（2026年9月）  ',
      )?.seriesId,
    ).toBe('3440')
    expect(
      findTournamentSeriesByPublicName('セレクションカップ'),
    ).toBeUndefined()
  })
})
