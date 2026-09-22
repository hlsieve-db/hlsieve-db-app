import { describe, expect, it } from 'vitest'

import type { Card } from '../cards/types'
import {
  buildOshiEntry,
  hasOshiEntry,
  opponentOshiEntry,
  resolveOshiCard,
  resolveOshiDisplayName,
  selfOshiEntry,
} from './oshiEntry'
import type { TournamentReport, TournamentRound } from './types'

function card(cardNumber: string, name: string, overrides: Partial<Card> = {}) {
  return {
    cardNumber,
    name,
    imageUrl: `https://example.test/${cardNumber}.png`,
    cardType: 'oshi',
    colors: ['white'],
    isBuzz: false,
    tags: [],
    isLimited: false,
    abilities: [],
    arts: [],
    batonPass: [],
    effectTags: [],
    criticalColors: [],
    rarities: [],
    products: [],
    illustrators: [],
    qas: [],
    searchText: `${cardNumber} ${name}`,
    ...overrides,
  } as Card
}

const cards = [
  card('SORA-001', 'ときのそら'),
  // Two cards share this name, which is why the colour appears in labels.
  card('MARINE-R', '宝鐘マリン', { colors: ['red'] }),
  card('MARINE-B', '宝鐘マリン', { colors: ['blue'] }),
  card('MAIN-001', 'メインカード', { cardType: 'support' }),
]

function report(overrides: Partial<TournamentReport> = {}): TournamentReport {
  return {
    tournamentName: '大会',
    placement: '',
    swissRounds: [],
    tournamentRounds: [],
    ...overrides,
  }
}

describe('building an entry from what was typed', () => {
  it('records the card when the name identifies exactly one', () => {
    expect(buildOshiEntry('ときのそら', cards)).toEqual({
      name: 'ときのそら',
      cardNumber: 'SORA-001',
    })
  })

  // Picking one of them would file the report under a card nobody chose.
  it('records a name shared by several cards as text alone', () => {
    expect(buildOshiEntry('宝鐘マリン', cards)).toEqual({ name: '宝鐘マリン' })
  })

  it('records a name that matches nothing as text alone', () => {
    expect(buildOshiEntry('しらぬひと', cards)).toEqual({ name: 'しらぬひと' })
  })

  it('never matches a card that is not an oshi', () => {
    expect(buildOshiEntry('メインカード', cards)).toEqual({
      name: 'メインカード',
    })
  })

  it.each([
    ['', {}],
    ['   ', {}],
  ])('treats %s as nothing recorded', (text, expected) => {
    expect(buildOshiEntry(text, cards)).toEqual(expected)
  })

  it('trims what was typed', () => {
    expect(buildOshiEntry('  ときのそら  ', cards)).toEqual({
      name: 'ときのそら',
      cardNumber: 'SORA-001',
    })
  })

  // Matching is exact, so a partial name is text rather than a guess.
  it('does not match a partial name', () => {
    expect(buildOshiEntry('そら', cards)).toEqual({ name: 'そら' })
  })
})

describe('what to show for a stored entry', () => {
  it('shows the typed name', () => {
    expect(resolveOshiDisplayName({ name: 'しらぬひと' }, cards)).toBe(
      'しらぬひと',
    )
  })

  // Reports written before the field became free text hold only a number.
  it('resolves an older report holding only a card number', () => {
    expect(resolveOshiDisplayName({ cardNumber: 'SORA-001' }, cards)).toBe(
      'ときのそら',
    )
  })

  // Losing what someone recorded would be worse than showing it unresolved.
  it('shows an unresolvable card number as itself', () => {
    expect(resolveOshiDisplayName({ cardNumber: 'GONE-001' }, cards)).toBe(
      'GONE-001',
    )
  })

  it('prefers the typed name over the card number', () => {
    expect(
      resolveOshiDisplayName({ name: '手入力', cardNumber: 'SORA-001' }, cards),
    ).toBe('手入力')
  })

  it('shows nothing when nothing was recorded', () => {
    expect(resolveOshiDisplayName({}, cards)).toBeUndefined()
  })
})

describe('resolving the card behind an entry', () => {
  it('finds the card when a number is stored', () => {
    expect(resolveOshiCard({ cardNumber: 'SORA-001' }, cards)?.name).toBe(
      'ときのそら',
    )
  })

  it.each([
    ['no card number', {}],
    ['an unknown card number', { cardNumber: 'GONE-001' }],
    ['a name alone', { name: 'ときのそら' }],
  ])('finds nothing for %s', (_label, entry) => {
    expect(resolveOshiCard(entry, cards)).toBeUndefined()
  })
})

describe('reading the fields off a report and a round', () => {
  /**
   * These adapters exist because OshiEntry has only optional properties, so a
   * TournamentReport satisfies it structurally. Passing a report straight into
   * the helpers type checks and then reads nothing, which is a bug the compiler
   * cannot catch, so these pin the mapping down.
   */
  it('reads the report fields, which are named differently', () => {
    expect(
      selfOshiEntry(
        report({ selfOshiName: 'ときのそら', selfOshiCardNumber: 'SORA-001' }),
      ),
    ).toEqual({ name: 'ときのそら', cardNumber: 'SORA-001' })
  })

  it('reads the round fields, which are named differently again', () => {
    const round: TournamentRound = {
      opponentOshiName: '宝鐘マリン',
      opponentOshiCardNumber: undefined,
    }
    expect(opponentOshiEntry(round)).toEqual({
      name: '宝鐘マリン',
      cardNumber: undefined,
    })
  })

  it('resolves a report through the adapter, not by passing it directly', () => {
    const saved = report({ selfOshiCardNumber: 'SORA-001' })

    expect(resolveOshiDisplayName(selfOshiEntry(saved), cards)).toBe(
      'ときのそら',
    )
    // The report has no name or cardNumber property of its own, so reading it
    // as an entry would silently find nothing.
    expect(resolveOshiDisplayName(saved as never, cards)).toBeUndefined()
  })
})

describe('whether anything was recorded', () => {
  it.each([
    [{ name: 'ときのそら' }, true],
    [{ cardNumber: 'SORA-001' }, true],
    [{ name: 'x', cardNumber: 'y' }, true],
    [{}, false],
    [{ name: '   ' }, false],
  ])('%o is %s', (entry, expected) => {
    expect(hasOshiEntry(entry)).toBe(expected)
  })
})
