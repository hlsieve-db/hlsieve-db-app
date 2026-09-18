import { describe, expect, it } from 'vitest'

import cardsSnapshot from '../../../public/cards.json'
import type { CardsDataFile } from '../cards/types'
import { searchCards } from './searchCards'

const cards = (cardsSnapshot as CardsDataFile).cards
const mascotCards = cards.filter(
  (card) => card.cardType === 'support' && card.supportType === 'mascot',
)
const generalSupportCards = cards.filter(
  (card) =>
    card.cardType === 'support' &&
    card.supportSearchCategory === 'general' &&
    card.supportType !== 'mascot',
)

describe('production Mascot filter classification', () => {
  it('classifies every Mascot from formal support metadata without overlap', () => {
    expect(mascotCards).toHaveLength(45)
    expect(generalSupportCards).toHaveLength(40)
    expect(mascotCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardNumber: 'hBP01-116' }),
        expect.objectContaining({ cardNumber: 'hSD14-011' }),
      ]),
    )

    const mascotResults = searchCards(cards, {
      query: '',
      cardTypes: ['support_mascot'],
    })
    const generalResults = searchCards(cards, {
      query: '',
      cardTypes: ['support_general'],
    })
    expect(mascotResults).toHaveLength(45)
    expect(generalResults).toHaveLength(40)
    expect(
      mascotResults.filter((card) => generalResults.includes(card)),
    ).toHaveLength(0)
  })

  it('combines general support and Mascot with fixed OR semantics', () => {
    expect(
      searchCards(cards, {
        query: '',
        cardTypes: ['support_general', 'support_mascot'],
      }),
    ).toHaveLength(85)
  })
})
