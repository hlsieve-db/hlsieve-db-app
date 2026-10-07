import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { selectDueTournamentEventsForDate } from '../daily/dateSelection'
import {
  LocalTournamentQueueRepository,
  TournamentQueueLeaseConflictError,
} from '../queue/repository'
import type { TournamentDiscoveryCandidate } from './types'

const NOW = '2026-10-07T00:00:00.000Z'
const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  )
})

function candidate(sourceEventId = '1771029'): TournamentDiscoveryCandidate {
  return {
    sourceEventId,
    sourceUrl: `https://www.bushi-navi.com/event/result/${sourceEventId}`,
    seriesId: '3463',
    observedForDate: '2026-10-06',
    discoveredAt: NOW,
  }
}

async function queuePath(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'automated-intake-'))
  roots.push(root)
  return join(root, 'queue.json')
}

describe('Automated Intake repository integration', () => {
  it('queues 1771029 and makes it selectable in the same Daily run', async () => {
    const path = await queuePath()
    const repository = new LocalTournamentQueueRepository({ path })
    await expect(
      repository.automatedIntake([candidate()], NOW),
    ).resolves.toMatchObject({
      added: ['1771029'],
    })

    const selection = await selectDueTournamentEventsForDate({
      records: (await repository.load()).records,
      targetDate: '2026-10-06',
      now: NOW,
      probe: async (sourceEventId) => ({
        sourceEventId,
        eventDate: '2026-10-06',
      }),
      persist: (sourceEventId, eventDate) =>
        repository
          .setOfficialEventDate(sourceEventId, eventDate)
          .then(() => {}),
    })
    expect(selection.selected).toEqual(['1771029'])

    const beforeRepeat = await readFile(path, 'utf8')
    await expect(
      repository.automatedIntake([candidate()], NOW),
    ).resolves.toMatchObject({
      added: [],
      existing: ['1771029'],
    })
    expect(await readFile(path, 'utf8')).toBe(beforeRepeat)
    expect((await repository.load()).records).toHaveLength(1)
  })

  it('reloads the latest Queue after lock acquisition', async () => {
    const path = await queuePath()
    const discoveryTimeRepository = new LocalTournamentQueueRepository({ path })
    const concurrentRepository = new LocalTournamentQueueRepository({ path })
    const discovered = candidate()
    await concurrentRepository.enqueue('1771029', NOW)
    const before = await readFile(path, 'utf8')

    await expect(
      discoveryTimeRepository.automatedIntake([discovered], NOW),
    ).resolves.toMatchObject({ added: [], existing: ['1771029'] })
    expect(await readFile(path, 'utf8')).toBe(before)
  })

  it('preserves the whole Queue and releases the lock on replacement failure', async () => {
    const path = await queuePath()
    const base = new LocalTournamentQueueRepository({ path })
    await base.enqueue('1', NOW)
    const before = await readFile(path, 'utf8')
    const repository = new LocalTournamentQueueRepository({
      path,
      replaceFile: vi.fn(async () => {
        throw new Error('replacement failed')
      }),
    })

    await expect(
      repository.automatedIntake([candidate()], NOW),
    ).rejects.toThrow('replacement failed')
    expect(await readFile(path, 'utf8')).toBe(before)
    await expect(readFile(`${path}.lock`, 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('does not bypass an existing Queue lock', async () => {
    const path = await queuePath()
    await writeFile(`${path}.lock`, 'held', 'utf8')
    const repository = new LocalTournamentQueueRepository({ path })
    await expect(
      repository.automatedIntake([candidate()], NOW),
    ).rejects.toBeInstanceOf(TournamentQueueLeaseConflictError)
  })
})
