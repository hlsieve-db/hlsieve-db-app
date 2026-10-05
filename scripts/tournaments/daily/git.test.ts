import { describe, expect, it } from 'vitest'
import {
  classifyPublicationStatus,
  normalizeGitPorcelainOutput,
  validateDailyRecoveryPublicationChanges,
  validateDailyGitState,
  validatePublicationPaths,
  waitForStablePublicationDiff,
} from './git'

describe('Tournament Daily Git guards', () => {
  const base = {
    branch: 'main',
    status: '',
    behind: 0,
    ahead: 0,
    targetDate: '2026-10-04',
  }
  it('requires main, a clean tree, and no behind/diverged history', () => {
    expect(validateDailyGitState(base)).toBe('synced')
    expect(() => validateDailyGitState({ ...base, branch: 'topic' })).toThrow(
      'branch main',
    )
    expect(() =>
      validateDailyGitState({ ...base, status: ' M src/code.ts' }),
    ).toThrow('clean')
    expect(() => validateDailyGitState({ ...base, behind: 1 })).toThrow(
      'synchronized',
    )
    expect(() => validateDailyGitState({ ...base, ahead: 2 })).toThrow(
      'synchronized',
    )
  })
  it('preserves the leading tracked-worktree status column', () => {
    expect(
      normalizeGitPorcelainOutput(
        ' M public/tournaments/events/evt_1.json\r\n',
      ),
    ).toBe(' M public/tournaments/events/evt_1.json')
    expect(
      classifyPublicationStatus(
        normalizeGitPorcelainOutput(
          ' M public/tournaments/events/evt_1.json\r\n',
        ),
      ).allowed,
    ).toEqual(['public/tournaments/events/evt_1.json'])
  })
  it('allows only the exact same-day recovery commit', () => {
    expect(
      validateDailyGitState({
        ...base,
        ahead: 1,
        subject: 'data: publish tournament results for 2026-10-04',
      }),
    ).toBe('commit-pending-push')
    expect(() =>
      validateDailyGitState({ ...base, ahead: 1, subject: 'feat: unrelated' }),
    ).toThrow('unrelated')
  })
  it('allows a recovery hotfix only while the checkpoint publication stays unchanged', () => {
    expect(() => validateDailyRecoveryPublicationChanges([])).not.toThrow()
    expect(() =>
      validateDailyRecoveryPublicationChanges([
        'public/tournaments/index.json',
      ]),
    ).toThrow('publication changes')
  })
  it('allows only Tournament publication paths in an automatic data commit', () => {
    expect(
      validatePublicationPaths([
        'public/tournaments/index.json',
        'public/tournaments/oshi-master.json',
        'public/tournaments/events/existing.json',
        'public/tournaments/events/evt_1.json',
      ]),
    ).toHaveLength(4)
    for (const path of [
      'src/code.ts',
      'package.json',
      'public/other.json',
      'unknown.tmp',
    ])
      expect(() => validatePublicationPaths([path])).toThrow('unexpected')
  })

  it('classifies allowed, temporary, and unexpected paths for diagnostics', () => {
    expect(
      classifyPublicationStatus(
        [
          ' M public/tournaments/index.json',
          '?? public/tournaments/events/new.json',
          '?? public/.tournaments.123e4567-e89b-12d3-a456-426614174000.backup/',
          ' M src/code.ts',
          '?? unknown.tmp',
        ].join('\n'),
      ),
    ).toEqual({
      allowed: [
        'public/tournaments/index.json',
        'public/tournaments/events/new.json',
      ],
      temporary: [
        'public/.tournaments.123e4567-e89b-12d3-a456-426614174000.backup/',
      ],
      unexpectedTracked: ['src/code.ts'],
      unexpectedUntracked: ['unknown.tmp'],
    })
  })

  it('waits for a changing atomic publication inventory to settle', async () => {
    const statuses = [
      '?? public/.tournaments.123e4567-e89b-12d3-a456-426614174000.candidate/',
      ' M public/tournaments/index.json\n?? transient.tmp',
      ' M public/tournaments/index.json\n?? public/tournaments/events/new.json',
      ' M public/tournaments/index.json\n?? public/tournaments/events/new.json',
    ]
    let index = 0
    await expect(
      waitForStablePublicationDiff({
        scan: async () => statuses[Math.min(index++, statuses.length - 1)]!,
        pause: async () => undefined,
      }),
    ).resolves.toEqual([
      'public/tournaments/index.json',
      'public/tournaments/events/new.json',
    ])
    expect(index).toBe(4)
  })

  it('fails with a complete inventory when temp or unexpected paths persist', async () => {
    let time = 0
    await expect(
      waitForStablePublicationDiff({
        scan: async () =>
          '?? public/.tournaments.123e4567-e89b-12d3-a456-426614174000.backup/',
        pause: async () => {
          time += 10
        },
        now: () => time,
        timeoutMs: 10,
      }),
    ).rejects.toThrow(/Observed temp files: public\/.tournaments/)
    await expect(
      waitForStablePublicationDiff({
        scan: async () => ' M public/tournaments/index.json\n?? unexpected.txt',
        pause: async () => undefined,
      }),
    ).rejects.toThrow(/Unexpected untracked: unexpected.txt/)
  })

  it('has a bounded default timeout for a persistent temp path', async () => {
    let scans = 0
    let time = 0
    await expect(
      waitForStablePublicationDiff({
        scan: async () => {
          scans += 1
          if (scans > 3) throw new Error('unbounded wait')
          return '?? public/.tournaments.123e4567-e89b-12d3-a456-426614174000.backup/'
        },
        pause: async () => {
          time += 2_500
        },
        now: () => time,
      }),
    ).rejects.toThrow(/timeout/)
  })
})
