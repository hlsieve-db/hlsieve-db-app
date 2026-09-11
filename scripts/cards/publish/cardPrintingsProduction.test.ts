/** @vitest-environment node */

import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import type { Card, CardsDataFile } from '../../../src/domain/cards/types'
import { searchCards } from '../../../src/domain/search/searchCards'
import { matchesSecondTurnOne } from '../derive/effectTextRules'
import { validateCardPrintingsSnapshotText } from './validateCardPrintingsSnapshot'
import { validateCardsSnapshotText } from './validateCardsSnapshot'

describe('production card printing snapshot', () => {
  it('is compatible, complete, visual-only, and preserves regressions', async () => {
    const cardsText = await readFile('public/cards.json', 'utf8')
    const cardsValidation = validateCardsSnapshotText(cardsText)
    expect(cardsValidation.ok).toBe(true)
    if (!cardsValidation.ok) return

    const printingText = await readFile('public/card-printings.json', 'utf8')
    const printingValidation = validateCardPrintingsSnapshotText(
      printingText,
      cardsValidation.value,
    )
    expect(printingValidation.ok).toBe(true)
    if (!printingValidation.ok) return

    const data = printingValidation.value
    expect(Object.keys(data.cards)).toHaveLength(
      cardsValidation.value.cards.length,
    )
    const printings = Object.values(data.cards).flatMap(
      (group) => group.printings,
    )
    expect(new Set(printings.map((printing) => printing.officialId)).size).toBe(
      printings.length,
    )
    expect(printings.every((printing) => printing.imageUrl)).toBe(true)

    const fuwamoco = data.cards['hBP03-050']
    expect(fuwamoco).toMatchObject({
      defaultPrintingOfficialId: '2545',
    })
    expect(fuwamoco?.printings).toHaveLength(5)
    const logicalFuwamoco = cardsValidation.value.cards.find(
      (card) => card.cardNumber === 'hBP03-050',
    )
    expect(fuwamoco?.printings[0]?.imageUrl).toBe(logicalFuwamoco?.imageUrl)

    for (const printing of printings) {
      expect(printing).not.toHaveProperty('isBuzz')
      expect(printing).not.toHaveProperty('abilities')
      expect(printing).not.toHaveProperty('conflicts')
      expect(printing).not.toHaveProperty('representativeImageOfficialId')
    }
    expect(isBuzz(cardsValidation.value, 'hBP07-019')).toBe(true)
    expect(isBuzz(cardsValidation.value, 'hBP07-048')).toBe(true)
    expect(isBuzz(cardsValidation.value, 'hBP07-076')).toBe(true)
    const buzzResults = searchCards(cardsValidation.value.cards, {
      query: '',
      bloom: ['buzz'],
    })
    expect(buzzResults.map((card) => card.cardNumber)).toEqual(
      expect.arrayContaining(['hBP07-019', 'hBP07-048', 'hBP07-076']),
    )

    const secondTurnOneCards = cardsValidation.value.cards.filter((card) =>
      card.effectTags.includes('second_turn_one'),
    )
    expect(secondTurnOneCards).toHaveLength(52)
    expect(
      secondTurnOneCards.every((card) =>
        card.abilities.some(
          (ability) =>
            ability.type === 'collab' && matchesSecondTurnOne(ability.text),
        ),
      ),
    ).toBe(true)
    expect(effectTags(cardsValidation.value, 'hBP05-009')).toContain(
      'second_turn_one',
    )
    expect(effectTags(cardsValidation.value, 'hBP05-031')).not.toContain(
      'second_turn_one',
    )

    const volumeVortexProduct = 'ブースターパック「ボリュームヴォルテックス」'
    const volumeVortexCards = cardsValidation.value.cards.filter((card) =>
      /^hBP09-\d{3}$/.test(card.cardNumber),
    )
    expect(volumeVortexCards).toHaveLength(111)
    expect(
      volumeVortexCards.every(
        (card) =>
          card.products.includes(volumeVortexProduct) &&
          card.releaseDate === '2026-09-19' &&
          data.cards[card.cardNumber]?.printings.some((printing) => {
            const url = new URL(printing.officialUrl)
            return (
              printing.products.includes(volumeVortexProduct) &&
              url.protocol === 'https:' &&
              url.host === 'hololive-official-cardgame.com' &&
              url.pathname === '/cardlist/'
            )
          }),
      ),
    ).toBe(true)
  })
})

function isBuzz(cards: CardsDataFile, cardNumber: string): boolean | undefined {
  return cards.cards.find((card) => card.cardNumber === cardNumber)?.isBuzz
}

function effectTags(
  cards: CardsDataFile,
  cardNumber: string,
): Card['effectTags'] | undefined {
  return cards.cards.find((card) => card.cardNumber === cardNumber)?.effectTags
}
