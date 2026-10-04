import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { emptyTournamentQueue, enqueueTournament } from './queue'
import {
  LocalTournamentQueueRepository,
  parseTournamentQueueFile,
  TournamentQueueCorruptError,
  TournamentQueueLeaseConflictError,
} from './repository'

const NOW = '2026-10-04T00:00:00.000Z'

async function queuePath(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), 'hlsieve-queue-'))
  const path = resolve(root, '.cache/tournaments/queue/queue.json')
  await mkdir(dirname(path), { recursive: true })
  return path
}

describe('LocalTournamentQueueRepository', () => {
  it('loads an absent queue, saves atomically, and reloads it', async () => {
    const path = await queuePath()
    const repository = new LocalTournamentQueueRepository({ path })
    expect(await repository.load()).toEqual(emptyTournamentQueue())
    await repository.enqueue('1764903', NOW)
    expect(await repository.load()).toEqual(
      enqueueTournament(emptyTournamentQueue(), '1764903', NOW),
    )
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
      format: 'hlsieve-tournament-queue',
      formatVersion: 1,
    })
    expect(path.replaceAll('\\', '/')).toContain(
      '.cache/tournaments/queue/queue.json',
    )
  })

  it.each([
    '{bad json',
    JSON.stringify({ format: 'wrong', formatVersion: 1, records: [] }),
    JSON.stringify({
      format: 'hlsieve-tournament-queue',
      formatVersion: 1,
      records: [{ sourceEventId: 1764903 }],
    }),
    JSON.stringify({
      format: 'hlsieve-tournament-queue',
      formatVersion: 1,
      records: [
        {
          sourceEventId: '1764903',
          status: 'queued',
          firstSubmittedAt: NOW,
          lastSubmittedAt: NOW,
          attemptCount: 0,
          email: 'not-allowed@example.test',
        },
      ],
    }),
  ])('fails closed for corrupt queue content', async (content) => {
    const path = await queuePath()
    await writeFile(path, content, 'utf8')
    const repository = new LocalTournamentQueueRepository({ path })
    await expect(repository.load()).rejects.toBeInstanceOf(
      TournamentQueueCorruptError,
    )
    expect(await readFile(path, 'utf8')).toBe(content)
  })

  it('preserves the previous queue when replacement fails', async () => {
    const path = await queuePath()
    const repository = new LocalTournamentQueueRepository({ path })
    await repository.enqueue('1764903', NOW)
    const before = await readFile(path, 'utf8')
    const failing = new LocalTournamentQueueRepository({
      path,
      replaceFile: vi.fn(async () => {
        throw new Error('replacement failed')
      }),
    })
    await expect(
      failing.enqueue('1764904', '2026-10-05T00:00:00.000Z'),
    ).rejects.toThrow('replacement failed')
    expect(await readFile(path, 'utf8')).toBe(before)
  })

  it('claims, transitions, and persists one deduplicated record', async () => {
    const path = await queuePath()
    const repository = new LocalTournamentQueueRepository({ path })
    await repository.enqueue('1764903', NOW)
    await repository.enqueue(
      'https://www.bushi-navi.com/event/result/1764903',
      '2026-10-04T01:00:00.000Z',
    )
    expect((await repository.load()).records).toHaveLength(1)
    expect(await repository.claimDue(NOW, 60_000)).toMatchObject({
      status: 'collecting',
      leaseUntil: '2026-10-04T00:01:00.000Z',
    })
    expect(
      await repository.claimDue('2026-10-04T00:00:30.000Z', 60_000),
    ).toBeUndefined()
    await repository.transition('1764903', 'ready')
    await repository.transition('1764903', 'published', {
      publishedEventId: 'event-1',
    })
    expect((await repository.load()).records[0]).toMatchObject({
      status: 'published',
      publishedEventId: 'event-1',
    })
  })

  it('fails safely when another processor holds the mutation lock', async () => {
    const path = await queuePath()
    await writeFile(`${path}.lock`, 'held', { flag: 'wx' })
    const repository = new LocalTournamentQueueRepository({ path })
    await expect(repository.enqueue('1764903', NOW)).rejects.toBeInstanceOf(
      TournamentQueueLeaseConflictError,
    )
    await expect(readFile(path, 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })
})

describe('parseTournamentQueueFile', () => {
  it('rejects duplicate source Event IDs', () => {
    const record = enqueueTournament(emptyTournamentQueue(), '1764903', NOW)
      .records[0]!
    expect(() =>
      parseTournamentQueueFile({
        format: 'hlsieve-tournament-queue',
        formatVersion: 1,
        records: [record, record],
      }),
    ).toThrow(/duplicate Events/)
  })
})
