import { describe, expect, it } from 'vitest'

import { getTournamentSeriesConfig } from './seriesConfig'

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
