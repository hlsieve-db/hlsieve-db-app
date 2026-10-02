import { describe, expect, it } from 'vitest'

import { parseCollectorCli } from './cli'

describe('Collector CLI', () => {
  it('defaults to the safer headed dry-run mode', () => {
    const options = parseCollectorCli([
      '--from',
      '2026-09-19',
      '--to',
      '2026-09-23',
    ])
    expect(options).toMatchObject({ dryRun: true, headless: false })
  })

  it('supports explicit headless publish and a single Event smoke target', () => {
    const options = parseCollectorCli([
      '--headless',
      '--publish',
      '--series',
      '3440',
      '--event-id',
      '1764903',
      '--from',
      '2026-09-23',
      '--to',
      '2026-09-23',
    ])
    expect(options).toMatchObject({
      dryRun: false,
      headless: true,
      seriesIds: ['3440'],
      sourceEventId: '1764903',
    })
  })

  it('keeps one-Deck smoke mode dry-run only', () => {
    expect(
      parseCollectorCli([
        '--smoke',
        '--event-id',
        '1764903',
        '--from',
        '2026-09-23',
        '--to',
        '2026-09-23',
      ]),
    ).toMatchObject({ dryRun: true, smoke: true })
    expect(() => parseCollectorCli(['--smoke', '--publish'])).toThrow(/dry-run/)
    expect(() => parseCollectorCli(['--smoke'])).toThrow(/event-id/)
  })
})
