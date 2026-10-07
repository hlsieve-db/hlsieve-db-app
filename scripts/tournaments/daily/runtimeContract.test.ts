import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('Tournament Daily runtime contract', () => {
  it('reuses the headed queue collector without a headless fallback', async () => {
    const queue = await readFile(
      'scripts/tournaments/queue/runQueue.ts',
      'utf8',
    )
    const daily = await readFile(
      'scripts/tournaments/daily/runDaily.ts',
      'utf8',
    )
    expect(queue).toContain('chromium.launch({ headless: false })')
    expect(queue).not.toContain('headless: true')
    expect(daily).toContain("'tournaments:queue'")
    expect(daily).toContain('runTournamentDailyDiscoveryPhase')
    expect(daily).toContain('createOverlapDates(options.targetDate)')
    expect(daily).toContain('chromium.launch({ headless: false })')
    expect(daily).not.toContain('headless: true')
    expect(daily).toContain('let selectedEventIds: string[]')
    expect(daily).toContain('selected: selectedEventIds')
    expect(daily).not.toContain('selected: selection.selected')
    expect(daily).toMatch(/finally\s*{\s*await release\(\)/)
  })
  it('provides a Task Scheduler wrapper that propagates the exit code without credentials', async () => {
    const wrapper = await readFile('scripts/tournaments/run-daily.ps1', 'utf8')
    expect(wrapper).toContain('npm run tournaments:daily -- --yesterday')
    expect(wrapper).toContain('exit $LASTEXITCODE')
    expect(wrapper).not.toMatch(/token|password|secret/i)
  })
})
