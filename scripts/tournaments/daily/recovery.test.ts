import { describe, expect, it } from 'vitest'

import type { TournamentReadyArtifact } from '../queue/readyArtifact'
import { recoverWrittenPublication } from './recovery'

const artifact = {
  sourceEventId: '1761090',
  event: {
    id: 'evt_1',
    results: [{ id: 'result_1' }],
  },
} as TournamentReadyArtifact

describe('Daily written-publication recovery', () => {
  it('reuses the installed publication without rewriting it', () => {
    expect(
      recoverWrittenPublication({
        artifacts: [artifact],
        expectedDatasetVersion: 'version',
        index: {
          format: 'hlsieve-tournament-index',
          formatVersion: 1,
          dataVersion: 'version',
          startDate: '2026-09-19',
          events: [{ id: 'evt_1', resultCount: 1 }],
        } as never,
        oshiMaster: {
          format: 'hlsieve-tournament-oshi-master',
          formatVersion: 1,
          cardsDataVersion: 'cards',
          cards: { OSHI: {} },
        } as never,
      }),
    ).toMatchObject({
      write: true,
      resultAdded: 1,
      datasetVersion: 'version',
      publishedEventIds: { '1761090': 'evt_1' },
    })
  })

  it('fails closed for version drift or a missing Event', () => {
    const base = {
      artifacts: [artifact],
      oshiMaster: { cards: {} } as never,
      index: { dataVersion: 'actual', events: [] } as never,
    }
    expect(() =>
      recoverWrittenPublication({
        ...base,
        expectedDatasetVersion: 'expected',
      }),
    ).toThrow(/version changed/)
    expect(() =>
      recoverWrittenPublication({
        ...base,
        expectedDatasetVersion: 'actual',
      }),
    ).toThrow(/Event is missing/)
  })
})
