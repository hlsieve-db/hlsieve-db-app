import { describe, expect, it } from 'vitest'

import cardsSnapshot from '../../../public/cards.json'
import { compareCardsByReading } from '../cards/readingOrder'
import type { Card, CardsDataFile } from '../cards/types'
import {
  formatOshiLabel,
  formatOshiOptionLabel,
  getOshiCandidates,
  searchOshiCandidates,
} from './oshi'

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    cardNumber: 'OSHI-001',
    name: 'AZKi',
    nameReading: 'あずき',
    cardType: 'oshi',
    colors: ['red'],
    isBuzz: false,
    tags: [],
    abilities: [],
    arts: [],
    batonPass: [],
    effectTags: [],
    criticalColors: [],
    rarities: [],
    products: [],
    illustrators: [],
    qas: [],
    searchText: '',
    ...overrides,
  }
}

describe('tournament report Oshi helpers', () => {
  it('keeps logical Oshi cards only and deduplicates cardNumber', () => {
    const oshi = makeCard()
    expect(
      getOshiCandidates([
        oshi,
        { ...oshi },
        makeCard({ cardNumber: 'MEM-001', cardType: 'holomem' }),
      ]),
    ).toEqual([oshi])
  })

  it('leaves a unique name unadorned', () => {
    const azki = makeCard()
    expect(formatOshiLabel(azki, [azki])).toBe('AZKi')
  })

  it('distinguishes same-name variants using existing color labels', () => {
    const red = makeCard({ name: '宝鐘マリン', cardNumber: 'OSHI-RED' })
    const blue = makeCard({
      name: '宝鐘マリン',
      cardNumber: 'OSHI-BLUE',
      colors: ['blue'],
    })

    expect(formatOshiLabel(red, [red, blue])).toBe('宝鐘マリン 【赤】')
    expect(formatOshiLabel(blue, [red, blue])).toBe('宝鐘マリン 【青】')
  })

  it('uses official display order for multicolor labels', () => {
    const multicolor = makeCard({
      cardNumber: 'OSHI-MULTI',
      colors: ['blue', 'red'],
    })
    const variant = makeCard({ cardNumber: 'OSHI-VARIANT' })

    expect(formatOshiLabel(multicolor, [multicolor, variant])).toBe(
      'AZKi 【赤/青】',
    )
    expect(formatOshiOptionLabel(multicolor, [multicolor, variant])).toBe(
      'AZKi 【赤/青】（OSHI-MULTI）',
    )
  })

  it('searches by normalized name, reading, and cardNumber', () => {
    const azki = makeCard()
    const marine = makeCard({
      cardNumber: 'OSHI-777',
      name: '宝鐘マリン',
      nameReading: 'ほうしょうまりん',
    })
    const candidates = [azki, marine]

    expect(searchOshiCandidates(candidates, 'ＡＺＫＩ')).toEqual([azki])
    expect(searchOshiCandidates(candidates, 'ほうしょう')).toEqual([marine])
    expect(searchOshiCandidates(candidates, 'oshi-777')).toEqual([marine])
  })

  it('orders candidates by reading, name, colour, then card number', () => {
    const candidates = getOshiCandidates([
      makeCard({
        cardNumber: 'O-PEKO',
        name: '兎田ぺこら',
        nameReading: 'うさだぺこら',
      }),
      makeCard({
        cardNumber: 'O-AZ-2',
        name: 'AZKi',
        nameReading: 'あずき',
        colors: ['blue'],
      }),
      makeCard({
        cardNumber: 'O-AZ-1',
        name: 'AZKi',
        nameReading: 'あずき',
        colors: ['blue'],
      }),
      makeCard({
        cardNumber: 'O-AZ-W',
        name: 'AZKi',
        nameReading: 'あずき',
        colors: ['white'],
      }),
      makeCard({
        cardNumber: 'O-SORA',
        name: 'ときのそら',
        nameReading: 'ときのそら',
      }),
    ])

    expect(candidates.map((card) => card.cardNumber)).toEqual([
      // あずき: white before blue, then card number within the same colour.
      'O-AZ-W',
      'O-AZ-1',
      'O-AZ-2',
      // うさだぺこら → ときのそら
      'O-PEKO',
      'O-SORA',
    ])
  })

  it('falls back to the name when a candidate has no reading', () => {
    const candidates = getOshiCandidates([
      makeCard({
        cardNumber: 'O-YUKI',
        name: '雪花ラミィ',
        nameReading: 'ゆきはならみい',
      }),
      makeCard({
        cardNumber: 'O-FUWA',
        name: 'FUWAMOCO',
        nameReading: undefined,
      }),
      makeCard({ cardNumber: 'O-AZKI', name: 'AZKi', nameReading: 'あずき' }),
    ])

    // "FUWAMOCO" sorts by its own name, ahead of the kana readings.
    expect(candidates.map((card) => card.cardNumber)).toEqual([
      'O-FUWA',
      'O-AZKI',
      'O-YUKI',
    ])
  })

  it('breaks reading ties on the name', () => {
    const candidates = getOshiCandidates([
      makeCard({ cardNumber: 'O-B', name: '鈴木', nameReading: 'すずき' }),
      makeCard({ cardNumber: 'O-A', name: '寿々木', nameReading: 'すずき' }),
    ])
    expect(candidates.map((card) => card.name)).toEqual(['寿々木', '鈴木'])
  })

  it('keeps a filtered subset in the same reading order', () => {
    const candidates = getOshiCandidates([
      makeCard({
        cardNumber: 'O-PEKO',
        name: '兎田ぺこら',
        nameReading: 'うさだぺこら',
      }),
      makeCard({
        cardNumber: 'O-SORA',
        name: 'ときのそら',
        nameReading: 'ときのそら',
      }),
      makeCard({
        cardNumber: 'O-AZ-2',
        name: 'AZKi',
        nameReading: 'あずき',
        colors: ['blue'],
      }),
      makeCard({
        cardNumber: 'O-AZ-W',
        name: 'AZKi',
        nameReading: 'あずき',
        colors: ['white'],
      }),
    ])

    expect(
      searchOshiCandidates(candidates, '').map((card) => card.cardNumber),
    ).toEqual(['O-AZ-W', 'O-AZ-2', 'O-PEKO', 'O-SORA'])
    expect(
      searchOshiCandidates(candidates, 'あずき').map((card) => card.cardNumber),
    ).toEqual(['O-AZ-W', 'O-AZ-2'])
  })
})

const productionCards = (cardsSnapshot as CardsDataFile).cards
const candidates = getOshiCandidates(productionCards)

describe('production Oshi candidate ordering', () => {
  it('keeps every logical Oshi candidate without truncating or merging', () => {
    expect(candidates).toHaveLength(162)
    expect(new Set(candidates.map((card) => card.cardNumber)).size).toBe(162)
    expect(new Set(candidates.map((card) => card.name)).size).toBe(69)
  })

  it('returns the candidates in Japanese reading order', () => {
    for (let index = 1; index < candidates.length; index += 1) {
      expect(
        compareCardsByReading(candidates[index - 1], candidates[index]),
      ).toBeLessThanOrEqual(0)
    }
  })

  it('groups every variant of the same member together', () => {
    const firstIndexByName = new Map<string, number>()
    candidates.forEach((card, index) => {
      if (!firstIndexByName.has(card.name))
        firstIndexByName.set(card.name, index)
    })
    candidates.forEach((card, index) => {
      if (index === 0) return
      const previous = candidates[index - 1]
      if (previous.name === card.name) return
      // A name may only start once; seeing it again would mean a split group.
      expect(firstIndexByName.get(card.name)).toBe(index)
    })
  })

  it('orders a reading-less candidate by its name instead of dropping it', () => {
    const fuwamoco = candidates.filter((card) => card.name === 'FUWAMOCO')
    expect(fuwamoco.length).toBeGreaterThan(0)
    fuwamoco.forEach((card) => expect(card.nameReading).toBeUndefined())

    const indexes = fuwamoco.map((card) => candidates.indexOf(card))
    expect(Math.max(...indexes) - Math.min(...indexes)).toBe(
      fuwamoco.length - 1,
    )
  })

  it('keeps AZKi variants contiguous and in canonical colour order', () => {
    const azki = candidates.filter((card) => card.name === 'AZKi')
    expect(azki.length).toBeGreaterThan(1)

    const start = candidates.indexOf(azki[0])
    expect(candidates.slice(start, start + azki.length)).toEqual(azki)
    // 緑 before 紫 in the canonical order.
    expect(azki[0].colors).toContain('green')
    expect(azki[azki.length - 1].colors).toContain('purple')
  })

  it('preserves the ordering for a filtered subset', () => {
    const filtered = searchOshiCandidates(candidates, 'あずき')
    expect(filtered.length).toBeGreaterThan(1)
    expect(filtered).toEqual([...filtered].sort(compareCardsByReading))
  })
})
