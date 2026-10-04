import { describe, expect, it } from 'vitest'
import {
  getTournamentPlacementMaxRank,
  selectTournamentPlacementResults,
} from './placement'

describe('Tournament placement range', () => {
  it.each([
    [1, 8],
    [32, 8],
    [33, 16],
    [64, 16],
  ])('maps participant count %s to Top%s', (participantCount, maxRank) => {
    expect(getTournamentPlacementMaxRank(participantCount)).toBe(maxRank)
  })

  it.each([undefined, 0, 65, 1.5])(
    'rejects unsupported participant count %s',
    (participantCount) => {
      expect(() => getTournamentPlacementMaxRank(participantCount)).toThrow(
        'supported placement range',
      )
    },
  )

  it('selects through the calculated maximum without mutating input', () => {
    const input = [{ rank: 17 }, { rank: 16 }, { rank: 1 }]
    expect(selectTournamentPlacementResults(input, 60)).toEqual([
      { rank: 16 },
      { rank: 1 },
    ])
    expect(input).toEqual([{ rank: 17 }, { rank: 16 }, { rank: 1 }])
  })
})
