import { describe, expect, it } from 'vitest'
import { validateDailyGitState, validatePublicationPaths } from './git'

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
  it('allows only Tournament publication paths in an automatic data commit', () => {
    expect(
      validatePublicationPaths([
        'public/tournaments/index.json',
        'public/tournaments/events/evt_1.json',
      ]),
    ).toHaveLength(2)
    expect(() => validatePublicationPaths(['src/code.ts'])).toThrow(
      'unexpected',
    )
  })
})
