import { describe, expect, it } from 'vitest'

import {
  claimDueTournament,
  emptyTournamentQueue,
  enqueueTournament,
  transitionTournamentQueueRecord,
  updateTournamentQueueRecord,
  waitingResultAttemptAt,
} from './queue'

const DAY_0 = '2026-10-04T00:00:00.000Z'

describe('Tournament queue domain', () => {
  it('deduplicates submissions while preserving the first timestamp', () => {
    const first = enqueueTournament(emptyTournamentQueue(), '1764903', DAY_0)
    const second = enqueueTournament(
      first,
      'https://www.bushi-navi.com/event/result/1764903',
      '2026-10-05T00:00:00.000Z',
    )
    expect(second.records).toHaveLength(1)
    expect(second.records[0]).toEqual({
      sourceEventId: '1764903',
      status: 'queued',
      firstSubmittedAt: DAY_0,
      lastSubmittedAt: '2026-10-05T00:00:00.000Z',
      attemptCount: 0,
    })
    expect(Object.keys(second.records[0]!)).not.toEqual(
      expect.arrayContaining(['email', 'name', 'snsId', 'playerName']),
    )
  })

  it('turns a published resubmission into an explicit queued recheck', () => {
    const queued = enqueueTournament(emptyTournamentQueue(), '1764903', DAY_0)
    const published = updateTournamentQueueRecord(
      queued,
      '1764903',
      (record) => {
        const collecting = transitionTournamentQueueRecord(record, 'collecting')
        const ready = transitionTournamentQueueRecord(collecting, 'ready')
        return transitionTournamentQueueRecord(ready, 'published', {
          publishedEventId: 'event-1',
        })
      },
    )
    const resubmitted = enqueueTournament(
      published,
      '1764903',
      '2026-10-06T00:00:00.000Z',
    )
    expect(resubmitted.records[0]).toMatchObject({
      status: 'queued',
      firstSubmittedAt: DAY_0,
      lastSubmittedAt: '2026-10-06T00:00:00.000Z',
      publishedEventId: 'event-1',
    })
  })

  it('fixes the waiting-result schedule at Day 0, 1, 3, 7, and 14', () => {
    expect(
      [0, 1, 2, 3, 4, 5].map((attempt) =>
        waitingResultAttemptAt(DAY_0, attempt),
      ),
    ).toEqual([
      '2026-10-04T00:00:00.000Z',
      '2026-10-05T00:00:00.000Z',
      '2026-10-07T00:00:00.000Z',
      '2026-10-11T00:00:00.000Z',
      '2026-10-18T00:00:00.000Z',
      undefined,
    ])
  })

  it('claims due work, blocks an active lease, and reclaims an expired lease', () => {
    const queued = enqueueTournament(emptyTournamentQueue(), '1764903', DAY_0)
    const first = claimDueTournament(queued, DAY_0, 60_000)
    expect(first.record).toMatchObject({
      sourceEventId: '1764903',
      status: 'collecting',
      attemptCount: 1,
      leaseUntil: '2026-10-04T00:01:00.000Z',
    })
    expect(
      claimDueTournament(first.queue, '2026-10-04T00:00:59.999Z', 60_000)
        .record,
    ).toBeUndefined()
    expect(
      claimDueTournament(first.queue, '2026-10-04T00:01:00.000Z', 60_000)
        .record,
    ).toMatchObject({ attemptCount: 2, status: 'collecting' })
  })

  it('allows only the explicit status transitions', () => {
    const record = enqueueTournament(emptyTournamentQueue(), '1764903', DAY_0)
      .records[0]!
    expect(() => transitionTournamentQueueRecord(record, 'published')).toThrow(
      /Invalid Tournament queue transition/,
    )
    expect(() => transitionTournamentQueueRecord(record, 'ready')).toThrow(
      /Invalid Tournament queue transition/,
    )
    const collecting = transitionTournamentQueueRecord(record, 'collecting')
    const waiting = transitionTournamentQueueRecord(
      { ...collecting, attemptCount: 1 },
      'waiting-result',
    )
    expect(waiting).toMatchObject({
      status: 'waiting-result',
      nextAttemptAt: '2026-10-05T00:00:00.000Z',
    })
    expect(() =>
      transitionTournamentQueueRecord(collecting, 'needs-review'),
    ).toThrow(/error code/)
  })
})
