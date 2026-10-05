import { describe, expect, it } from 'vitest'

import { parseTournamentIntakeCli } from './intakeCli'

describe('Tournament intake CLI', () => {
  it('defaults to dry-run and supports write and JSON output', () => {
    expect(parseTournamentIntakeCli(['--file', 'events.txt'])).toEqual({
      file: 'events.txt',
      write: false,
      json: false,
    })
    expect(
      parseTournamentIntakeCli(['--json', '--write', '--file', 'events.txt']),
    ).toEqual({ file: 'events.txt', write: true, json: true })
  })

  it.each([
    [[]],
    [['--write']],
    [['--file']],
    [['--file', 'a', '--file', 'b']],
    [['--unknown', 'a']],
  ])('rejects incomplete or unknown arguments: %j', (args) => {
    expect(() => parseTournamentIntakeCli(args)).toThrow(/Usage|only/)
  })
})
