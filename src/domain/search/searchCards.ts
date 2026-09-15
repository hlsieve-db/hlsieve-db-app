import type { Card, CardColor, CriticalColor, EffectTag } from '../cards/types'
import { normalizeSearchQuery } from './normalizeSearchQuery'
import type { BloomFilterValue, CardTypeFilterValue, MatchMode } from './types'

export type SearchCardsInput = {
  query: string
  colors?: readonly CardColor[]
  colorMode?: MatchMode
  cardTypes?: readonly CardTypeFilterValue[]
  bloom?: readonly BloomFilterValue[]
  criticalColors?: readonly CriticalColor[]
  criticalColorMode?: MatchMode
  effectTags?: readonly EffectTag[]
  effectTagMode?: MatchMode
}

export type TextSearchInput = SearchCardsInput

const SUPPORT_FILTER_CATEGORIES = {
  support_limited: 'limited',
  support_general: 'general',
  support_tool: 'tool',
  support_fan: 'fan',
} as const satisfies Record<
  Exclude<CardTypeFilterValue, Card['cardType']>,
  NonNullable<Card['supportSearchCategory']>
>

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

function matchesCardTypes(
  card: Card,
  selectedValues: readonly CardTypeFilterValue[] | undefined,
): boolean {
  if (!selectedValues || selectedValues.length === 0) return true
  return [...new Set(selectedValues)].some((value) => {
    if (value === 'oshi' || value === 'holomem' || value === 'cheer') {
      return card.cardType === value
    }
    const supportCategory = SUPPORT_FILTER_CATEGORIES[value]
    return (
      card.cardType === 'support' &&
      card.supportSearchCategory === supportCategory
    )
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
      matchesCardTypes(card, input.cardTypes) &&
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
