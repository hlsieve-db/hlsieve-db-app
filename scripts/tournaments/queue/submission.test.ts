import { describe, expect, it } from 'vitest'

import {
  buildOfficialTournamentResultUrl,
  parseTournamentSourceEventId,
} from './submission'

describe('Tournament submission parser', () => {
  it('accepts only canonical Result URLs and direct ASCII IDs', () => {
    expect(
      parseTournamentSourceEventId(
        'https://www.bushi-navi.com/event/result/1764903',
      ),
    ).toBe('1764903')
    expect(parseTournamentSourceEventId(' 1764903 ')).toBe('1764903')
    expect(parseTournamentSourceEventId('0001764903')).toBe('1764903')
    expect(parseTournamentSourceEventId('9007199254740991')).toBe(
      '9007199254740991',
    )
  })

  it.each([
    'http://www.bushi-navi.com/event/result/1764903',
    'https://bushi-navi.com/event/result/1764903',
    'https://www.bushi-navi.com.evil.example/event/result/1764903',
    'https://www.bushi-navi.com:8443/event/result/1764903',
    'https://user@www.bushi-navi.com/event/result/1764903',
    'https://www.bushi-navi.com/event/result/1764903?x=1',
    'https://www.bushi-navi.com/event/result/1764903#x',
    'https://www.bushi-navi.com/api/event/result/1764903',
    'https://www.bushi-navi.com/event/result/1764903/extra',
    'https://www.bushi-navi.com/event/result/%31%37%36%34%39%30%33',
    ' https://www.bushi-navi.com/event/result/1764903 ',
    'https://WWW.bushi-navi.com/event/result/1764903',
    'abc',
    '１２３',
    '0',
    '-1',
    '1.5',
    '1e3',
    '9007199254740992',
    '12345678901234567',
  ])('rejects invalid input: %s', (input) => {
    expect(() => parseTournamentSourceEventId(input)).toThrow()
  })

  it('builds only the canonical official URL', () => {
    expect(buildOfficialTournamentResultUrl('1764903')).toBe(
      'https://www.bushi-navi.com/event/result/1764903',
    )
    expect(() => buildOfficialTournamentResultUrl('0001764903')).toThrow()
    expect(() =>
      buildOfficialTournamentResultUrl('https://evil.example'),
    ).toThrow()
  })
})
