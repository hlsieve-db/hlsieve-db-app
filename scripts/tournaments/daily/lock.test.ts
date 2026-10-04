import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { acquireDailyLock, diagnoseDailyLock } from './lock'

describe('Tournament Daily lock', () => {
  it('prevents overlapping runs and releases only its own active lock', async () => {
    const path = resolve(
      await mkdtemp(resolve(tmpdir(), 'daily-lock-')),
      'daily.lock',
    )
    const release = await acquireDailyLock('2026-10-04', {
      path,
      now: '2026-10-05T00:00:00.000Z',
      pid: 100,
      hostname: 'host',
    })
    await expect(acquireDailyLock('2026-10-04', { path })).rejects.toThrow(
      'already exists',
    )
    expect(
      await diagnoseDailyLock({
        path,
        now: '2026-10-05T00:01:00.000Z',
        hostname: 'host',
        pidExists: () => true,
      }),
    ).toMatchObject({ state: 'active-local' })
    await release()
    await expect(diagnoseDailyLock({ path })).resolves.toEqual({
      state: 'absent',
    })
  })
  it('reports stale candidates without deleting them automatically', async () => {
    const path = resolve(
      await mkdtemp(resolve(tmpdir(), 'daily-lock-')),
      'daily.lock',
    )
    await acquireDailyLock('2026-10-04', {
      path,
      now: '2026-10-04T00:00:00.000Z',
      pid: 100,
      hostname: 'host',
    })
    expect(
      await diagnoseDailyLock({
        path,
        now: '2026-10-05T00:00:00.000Z',
        hostname: 'host',
        pidExists: () => false,
        ttlMs: 1,
      }),
    ).toMatchObject({ state: 'stale-candidate' })
  })
})
