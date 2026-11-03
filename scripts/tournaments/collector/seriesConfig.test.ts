import { describe, expect, it } from 'vitest'

import {
  findTournamentSeriesByPublicName,
  getTournamentSeriesConfig,
} from './seriesConfig'

describe('Tournament Collector series config', () => {
  it('maps the approved Selection Cup and Bloom Cup series', () => {
    expect(getTournamentSeriesConfig('3440')).toMatchObject({
      type: 'selectioncup',
      environment: 'bp09',
      year: 2026,
    })
    expect(getTournamentSeriesConfig('3440')).not.toHaveProperty('round')
    expect(getTournamentSeriesConfig('3463')).toMatchObject({
      type: 'selectioncup',
      environment: 'bp09',
      year: 2026,
    })
    expect(getTournamentSeriesConfig('3463')).not.toHaveProperty('round')
    const bloom = getTournamentSeriesConfig('3396')
    expect(bloom).toMatchObject({
      type: 'bloomcup',
      year: 2026,
    })
    expect(bloom).not.toHaveProperty('round')
    const novemberBloom = getTournamentSeriesConfig('3576')
    expect(novemberBloom).toMatchObject({
      type: 'bloomcup',
      year: 2026,
    })
    expect(novemberBloom).not.toHaveProperty('round')
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
    expect(
      findTournamentSeriesByPublicName(
        '  【ホロカ】セレクションカップ（2026年10月）  ',
      )?.seriesId,
    ).toBe('3463')
    expect(
      findTournamentSeriesByPublicName(
        '【ホロカ】セレクションカップ（2026年10月・追加開催）',
      ),
    ).toBeUndefined()
    expect(
      findTournamentSeriesByPublicName(
        '  【ホロカ】ブルームカップ「白銀ノエル」 （2026年11月開催）  ',
      )?.seriesId,
    ).toBe('3576')
    expect(
      findTournamentSeriesByPublicName(
        '【ホロカ】ブルームカップ「白銀ノエル」 （2026年12月開催）',
      ),
    ).toBeUndefined()
  })
})
