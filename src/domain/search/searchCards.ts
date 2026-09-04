import type { Card, CardColor, CriticalColor, EffectTag } from '../cards/types'
import { normalizeSearchQuery } from './normalizeSearchQuery'
import type { BloomFilterValue, MatchMode } from './types'

export type SearchCardsInput = {
  query: string
  colors?: readonly CardColor[]
  colorMode?: MatchMode
  cardTypes?: readonly Card['cardType'][]
  bloom?: readonly BloomFilterValue[]
  criticalColors?: readonly CriticalColor[]
  criticalColorMode?: MatchMode
  effectTags?: readonly EffectTag[]
  effectTagMode?: MatchMode
}

export type TextSearchInput = SearchCardsInput

function matchesSelection<T>(
  cardValues: readonly T[],
  selectedValues: readonly T[] | undefined,
  mode: MatchMode,
): boolean {
  if (!selectedValues || selectedValues.length === 0) return true
  const selected = new Set(selectedValues)
  return mode === 'and'
    ? [...selected].every((value) => cardValues.includes(value))
    : [...selected].some((value) => cardValues.includes(value))
}

function matchesBloom(
  card: Card,
  selectedValues: readonly BloomFilterValue[] | undefined,
): boolean {
  if (!selectedValues || selectedValues.length === 0) return true
  return [...new Set(selectedValues)].some((value) => {
    if (value === 'buzz') return card.isBuzz
    if (value === 'debut_normal') {
      return card.bloomLevel === 'debut' && card.debutType === 'normal'
    }
    if (value === 'debut_extra') {
      return card.bloomLevel === 'debut' && card.debutType === 'extra'
    }
    return card.bloomLevel === value
  })
}

export function searchCards(
  cards: readonly Card[],
  input: SearchCardsInput,
): Card[] {
  const tokens = normalizeSearchQuery(input.query).split(' ').filter(Boolean)
  return cards.filter(
    (card) =>
      tokens.every((token) => card.searchText.includes(token)) &&
      matchesSelection(card.colors, input.colors, input.colorMode ?? 'or') &&
      (!input.cardTypes ||
        input.cardTypes.length === 0 ||
        input.cardTypes.includes(card.cardType)) &&
      matchesBloom(card, input.bloom) &&
      matchesSelection(
        card.criticalColors,
        input.criticalColors,
        input.criticalColorMode ?? 'or',
      ) &&
      matchesSelection(
        card.effectTags,
        input.effectTags,
        input.effectTagMode ?? 'and',
      ),
  )
}
