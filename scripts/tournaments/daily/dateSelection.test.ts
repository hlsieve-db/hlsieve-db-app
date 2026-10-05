import { describe, expect, it, vi } from 'vitest'

import type { TournamentQueueRecord } from '../queue/queue'
import {
  processSelectedTournamentEvents,
  selectDueTournamentEventsForDate,
} from './dateSelection'

const NOW = '2026-10-05T00:00:00.000Z'

function queued(
  sourceEventId: string,
  eventDate?: string,
): TournamentQueueRecord {
  return {
    sourceEventId,
    status: 'queued',
    firstSubmittedAt: NOW,
    lastSubmittedAt: NOW,
    attemptCount: 0,
    ...(eventDate
      ? { eventDate, eventDateSource: 'bushi-navi-public-browser-dom' as const }
      : {}),
  }
}

describe('Daily Tournament date selection', () => {
  it('probes due Events and selects only the exact target date', async () => {
    const records = [queued('1'), queued('2'), queued('3')]
    const dates = new Map([
      ['1', '2026-10-02'],
      ['2', '2026-10-03'],
      ['3', '2026-10-04'],
    ])
    const persist = vi.fn()
    const result = await selectDueTournamentEventsForDate({
      records,
      targetDate: '2026-10-02',
      now: NOW,
      probe: async (sourceEventId) => ({
        sourceEventId,
        eventDate: dates.get(sourceEventId)!,
      }),
      persist,
    })
    expect(result).toEqual({
      selected: ['1'],
      unselected: ['2', '3'],
      probed: ['1', '2', '3'],
    })
    expect(records.slice(1)).toEqual([queued('2'), queued('3')])
    expect(persist).toHaveBeenCalledTimes(3)
  })

  it('reuses official cached dates without probing again', async () => {
    const probe = vi.fn()
    await expect(
      selectDueTournamentEventsForDate({
        records: [queued('1', '2026-10-02'), queued('2', '2026-10-03')],
        targetDate: '2026-10-02',
        now: NOW,
        probe,
        persist: vi.fn(),
      }),
    ).resolves.toMatchObject({ selected: ['1'], unselected: ['2'], probed: [] })
    expect(probe).not.toHaveBeenCalled()
  })

  it('does not trust an unverified human-supplied date', async () => {
    const record = {
      ...queued('1'),
      eventDate: '2026-10-02',
    } as TournamentQueueRecord
    const probe = vi.fn(async () => ({
      sourceEventId: '1',
      eventDate: '2026-10-03',
    }))
    const result = await selectDueTournamentEventsForDate({
      records: [record],
      targetDate: '2026-10-02',
      now: NOW,
      probe,
      persist: vi.fn(),
    })
    expect(probe).toHaveBeenCalledTimes(1)
    expect(result.selected).toEqual([])
  })

  it('fails closed on a probe identity mismatch', async () => {
    await expect(
      selectDueTournamentEventsForDate({
        records: [queued('1')],
        targetDate: '2026-10-02',
        now: NOW,
        probe: async () => ({ sourceEventId: '2', eventDate: '2026-10-02' }),
        persist: vi.fn(),
      }),
    ).rejects.toThrow(/identity mismatch/)
  })

  it('passes only selected IDs to full collection', async () => {
    const process = vi.fn()
    await processSelectedTournamentEvents(['1'], process)
    expect(process).toHaveBeenCalledTimes(1)
    expect(process).toHaveBeenCalledWith('1')
    expect(process).not.toHaveBeenCalledWith('2')
  })
})
