import { describe, expect, it } from 'vitest'

import cardsFile from '../../../public/cards.json'
import type { Card } from '../cards/types'
import { searchCards } from './searchCards'

const cards = cardsFile.cards as Card[]

function resultNumbers(query: string, includeQa: boolean): string[] {
  return searchCards(cards, { query, includeQa }).map(
    ({ cardNumber }) => cardNumber,
  )
}

describe('production optional Q&A search', () => {
  it('finds hSD16-007 from Q633 only when Q&A search is enabled', () => {
    const card = cards.find(({ cardNumber }) => cardNumber === 'hSD16-007')
    const qa = card?.qas.find(({ id }) => id === 'Q633')

    expect(qa?.question).toContain('白上フブキ')
    expect(resultNumbers('フブキ', false)).not.toContain('hSD16-007')
    expect(resultNumbers('フブキ', true)).toContain('hSD16-007')
  })

  it('keeps answer and Card-body plus Q&A multi-word AND semantics', () => {
    expect(resultNumbers('ターンプレイヤー', false)).not.toContain('hSD16-007')
    expect(resultNumbers('ターンプレイヤー', true)).toContain('hSD16-007')
    expect(resultNumbers('さくらみこ フブキ', true)).toContain('hSD16-007')
  })
})
