import { describe, expect, it } from 'vitest'

import {
  emptyTournamentQueue,
  enqueueTournament,
  transitionTournamentQueueRecord,
} from './queue'
import { applyTournamentIntake, previewTournamentIntake } from './intake'

const NOW = '2026-10-05T00:00:00.000Z'

describe('Tournament Event intake', () => {
  it('reuses strict parsing, canonicalizes IDs, removes blanks, and deduplicates', () => {
    const preview = previewTournamentIntake(
      [
        '',
        ' 0001764903 ',
        'https://www.bushi-navi.com/event/result/1764903',
        'https://www.bushi-navi.com/event/result/1764904',
        'https://evil.example/event/result/1',
        '１２３',
      ].join('\n'),
      emptyTournamentQueue(),
    )
    expect(preview.entries).toEqual([
      {
        input: '0001764903',
        line: 2,
        sourceEventId: '1764903',
        classification: 'new',
        action: 'add',
      },
      {
        input: 'https://www.bushi-navi.com/event/result/1764904',
        line: 4,
        sourceEventId: '1764904',
        classification: 'new',
        action: 'add',
      },
      expect.objectContaining({
        line: 5,
        classification: 'invalid',
        action: 'reject',
      }),
      expect.objectContaining({
        line: 6,
        classification: 'invalid',
        action: 'reject',
      }),
    ])
    expect(preview.summary).toMatchObject({ new: 2, invalid: 2 })
  })

  it('classifies every queue state and follows the existing requeue contract', () => {
    const base = enqueueTournament(emptyTournamentQueue(), '1', NOW).records[0]!
    const collecting = transitionTournamentQueueRecord(base, 'collecting')
    const waiting = transitionTournamentQueueRecord(
      { ...collecting, attemptCount: 1 },
      'waiting-result',
    )
    const ready = transitionTournamentQueueRecord(collecting, 'ready')
    const published = transitionTournamentQueueRecord(ready, 'published', {
      publishedEventId: 'evt-1',
    })
    const review = transitionTournamentQueueRecord(collecting, 'needs-review', {
      errorCode: 'review',
    })
    const queue = {
      ...emptyTournamentQueue(),
      records: [
        { ...base, sourceEventId: '1' },
        { ...collecting, sourceEventId: '2' },
        { ...waiting, sourceEventId: '3' },
        { ...review, sourceEventId: '4' },
        { ...ready, sourceEventId: '5' },
        { ...published, sourceEventId: '6' },
      ],
    }
    const preview = previewTournamentIntake('1\n2\n3\n4\n5\n6\n7', queue)
    expect(
      preview.entries.map(({ classification, action }) => ({
        classification,
        action,
      })),
    ).toEqual([
      { classification: 'queued', action: 'unchanged' },
      { classification: 'collecting', action: 'unchanged' },
      { classification: 'waiting-result', action: 'unchanged' },
      { classification: 'needs-review', action: 'requeue' },
      { classification: 'ready', action: 'unchanged' },
      { classification: 'published', action: 'requeue' },
      { classification: 'new', action: 'add' },
    ])
    const applied = applyTournamentIntake(queue, preview, NOW)
    expect(applied.records.map((record) => record.status)).toEqual([
      'queued',
      'collecting',
      'waiting-result',
      'queued',
      'ready',
      'queued',
      'queued',
    ])
  })

  it('does not mutate the queue during preview and never stores invalid input', () => {
    const queue = enqueueTournament(emptyTournamentQueue(), '1', NOW)
    const before = structuredClone(queue)
    const preview = previewTournamentIntake('2\ninvalid\n3', queue)
    expect(queue).toEqual(before)
    const applied = applyTournamentIntake(queue, preview, NOW)
    expect(applied.records.map((record) => record.sourceEventId)).toEqual([
      '1',
      '2',
      '3',
    ])
    expect(queue).toEqual(before)
  })
})
