import { describe, expect, it } from 'vitest'

import {
  activeNavigationGroup,
  activeNavigationItem,
  NAV_GROUPS,
  UPDATES_NAV_ITEM,
} from './navigation'

describe('site navigation definition', () => {
  it('keeps the five category groups and their routes in the agreed order', () => {
    expect(
      NAV_GROUPS.map(({ key, label, items }) => ({
        key,
        label,
        routes: items.map((item) => item.to),
      })),
    ).toEqual([
      {
        key: 'cards',
        label: 'カード',
        routes: ['/cards', '/favorites', '/recent', '/qa'],
      },
      {
        key: 'decks',
        label: 'デッキ',
        routes: ['/decks', '/deck-compare'],
      },
      {
        key: 'tournamentDb',
        label: '大会DB',
        routes: ['/tournaments', '/tournaments/analysis'],
      },
      {
        key: 'tournamentReport',
        label: '大会戦績',
        routes: [
          '/tournament-report',
          '/tournament-history',
          '/tournament-stats',
        ],
      },
      {
        key: 'tools',
        label: 'ツール',
        routes: ['/probability', '/mulligan', '/swiss'],
      },
    ])
    expect(UPDATES_NAV_ITEM.to).toBe('/updates')
  })

  it('does not duplicate global destination routes', () => {
    const routes = [
      ...NAV_GROUPS.flatMap((group) => group.items.map((item) => item.to)),
      UPDATES_NAV_ITEM.to,
    ]
    expect(new Set(routes).size).toBe(routes.length)
    expect(routes).not.toContain('/disclaimer')
  })

  it.each([
    ['/cards', 'cards'],
    ['/cards/hBP03-050', 'cards'],
    ['/favorites', 'cards'],
    ['/recent', 'cards'],
    ['/qa', 'cards'],
    ['/decks', 'decks'],
    ['/decks/deck-id', 'decks'],
    ['/deck-compare', 'decks'],
    ['/deck/share', 'decks'],
    ['/tournaments', 'tournamentDb'],
    ['/tournaments/event-id', 'tournamentDb'],
    ['/tournaments/event-id/results/result-id', 'tournamentDb'],
    ['/tournaments/analysis', 'tournamentDb'],
    ['/tournament-report', 'tournamentReport'],
    ['/tournament-history', 'tournamentReport'],
    ['/tournament-stats', 'tournamentReport'],
    ['/probability', 'tools'],
    ['/mulligan', 'tools'],
    ['/swiss', 'tools'],
  ] as const)('maps %s to the %s active category', (pathname, group) => {
    expect(activeNavigationGroup(pathname)).toBe(group)
  })

  it.each(['/updates', '/disclaimer', '/unknown'])(
    'does not invent an active category for %s',
    (pathname) => {
      expect(activeNavigationGroup(pathname)).toBeUndefined()
    },
  )

  it.each([
    ['/tournaments', 'tournamentDb', '/tournaments'],
    ['/tournaments/analysis', 'tournamentDb', '/tournaments/analysis'],
    ['/tournaments/event-id', 'tournamentDb', '/tournaments'],
    ['/tournaments/event-id/results/result-id', 'tournamentDb', '/tournaments'],
    ['/tournament-report', 'tournamentReport', '/tournament-report'],
    ['/tournament-history', 'tournamentReport', '/tournament-history'],
    ['/tournament-stats', 'tournamentReport', '/tournament-stats'],
  ] as const)(
    'maps %s to exactly one current item',
    (pathname, groupKey, expected) => {
      const group = NAV_GROUPS.find(({ key }) => key === groupKey)!
      expect(activeNavigationItem(pathname, group)).toBe(expected)
      expect(
        NAV_GROUPS.flatMap((candidate) =>
          candidate.items.filter(
            (item) => activeNavigationItem(pathname, candidate) === item.to,
          ),
        ),
      ).toHaveLength(1)
    },
  )
})
