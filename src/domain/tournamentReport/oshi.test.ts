import { describe, expect, it } from 'vitest'

import type { Card } from '../cards/types'
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
})
