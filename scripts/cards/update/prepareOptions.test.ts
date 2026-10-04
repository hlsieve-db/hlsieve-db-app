import { describe, expect, it } from 'vitest'

import { parsePrepareOptions } from './prepareOptions'

describe('parsePrepareOptions', () => {
  it('accepts repeated targeted refresh options and deduplicates IDs', () => {
    const result = parsePrepareOptions([
      '--refresh-official-id',
      '2718',
      '--refresh-official-id',
      '2841',
      '--refresh-official-id',
      '2718',
    ])

    expect([...result.forceRefreshOfficialIds]).toEqual(['2718', '2841'])
  })

  it.each([
    [['--unknown'], 'Unknown'],
    [['--refresh-official-id'], 'requires'],
    [['--refresh-official-id', 'abc'], 'requires'],
  ] as const)('rejects invalid arguments: %j', (args, message) => {
    expect(() => parsePrepareOptions(args)).toThrow(message)
  })
})
