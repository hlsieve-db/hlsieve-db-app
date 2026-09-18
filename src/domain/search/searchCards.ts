import type { Card, CardColor, CriticalColor, EffectTag } from '../cards/types'
import { normalizeOfficialQaSearchText } from '../qa/officialQaSearch'
import { normalizeSearchQuery } from './normalizeSearchQuery'
import { normalizeSearchText } from './normalizeSearchText'
import type { BloomFilterValue, CardTypeFilterValue, MatchMode } from './types'

export type SearchCardsInput = {
  query: string
  includeQa?: boolean
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

type CardSearchCorpus = {
  baseText: string
  qaText: string
}

const CARD_SEARCH_CORPUS_CACHE = new WeakMap<Card, CardSearchCorpus>()

function buildCardSearchCorpus(card: Card): CardSearchCorpus {
  const cached = CARD_SEARCH_CORPUS_CACHE.get(card)
  if (cached) return cached

  const qaSegments = card.qas
    .flatMap(({ question, answer }) => [question, answer])
    .map(normalizeSearchText)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
  let residualSearchText = normalizeSearchText(card.searchText)
  for (const qaSegment of qaSegments) {
    residualSearchText = residualSearchText.replaceAll(qaSegment, ' ')
  }

  const baseSegments: (string | undefined)[] = [
    card.name,
    card.cardNumber,
    card.nameReading,
    ...card.abilities.map(({ text }) => text),
    ...card.arts.flatMap(({ name, effectText }) => [name, effectText]),
    card.extraText,
    residualSearchText,
  ]
  const corpus = {
    baseText: normalizeSearchText(
      baseSegments.filter((value) => value !== undefined).join(' '),
    ),
    qaText: normalizeOfficialQaSearchText(card.qas),
  }
  CARD_SEARCH_CORPUS_CACHE.set(card, corpus)
  return corpus
}

const SUPPORT_FILTER_CATEGORIES = {
  support_limited: 'limited',
  support_general: 'general',
  support_tool: 'tool',
  support_fan: 'fan',
} as const satisfies Record<
  Exclude<CardTypeFilterValue, Card['cardType'] | 'support_mascot'>,
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
    if (value === 'support_mascot') {
      return card.cardType === 'support' && card.supportType === 'mascot'
    }
    const supportCategory = SUPPORT_FILTER_CATEGORIES[value]
    return (
      card.cardType === 'support' &&
      card.supportSearchCategory === supportCategory &&
      (value !== 'support_general' || card.supportType !== 'mascot')
    )
  })
}

export function searchCards(
  cards: readonly Card[],
  input: SearchCardsInput,
): Card[] {
  const tokens = normalizeSearchQuery(input.query).split(' ').filter(Boolean)
  return cards.filter((card) => {
    const corpus =
      tokens.length === 0
        ? ''
        : (() => {
            const { baseText, qaText } = buildCardSearchCorpus(card)
            return input.includeQa && qaText
              ? `${baseText} ${qaText}`
              : baseText
          })()
    return (
      tokens.every((token) => corpus.includes(token)) &&
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
      )
    )
  })
}
