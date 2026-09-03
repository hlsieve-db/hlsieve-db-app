import type { Ability, EffectTag } from '../../../src/domain/cards/types'
import type { MergedCardCandidate } from '../merge/types'
import {
  matchesArchiveRecovery,
  matchesArtsBoost,
  matchesCheerAcceleration,
  matchesCheerRecovery,
  matchesDamageReduction,
  matchesDeckSearch,
  matchesDraw,
  matchesSecondTurnOne,
  matchesSpecialDamage,
} from './effectTextRules'
import type { EffectTagEvidence, EffectTextSource } from './types'

export const EFFECT_TAG_ORDER = [
  'second_turn_one',
  'bloom_effect',
  'collab_effect',
  'gift',
  'draw',
  'deck_search',
  'cheer_acceleration',
  'cheer_recovery',
  'archive_recovery',
  'arts_boost',
  'damage_reduction',
  'special_damage',
] as const satisfies readonly EffectTag[]

export function collectEffectTextSources(
  card: MergedCardCandidate,
): EffectTextSource[] {
  const sources: EffectTextSource[] = card.abilities.map(
    (ability, sourceIndex) => ({
      source: 'ability_text',
      sourceIndex,
      text: ability.text,
    }),
  )

  card.arts.forEach((art, sourceIndex) => {
    if (art.effectText) {
      sources.push({ source: 'art_effect', sourceIndex, text: art.effectText })
    }
  })
  if (card.extraText) {
    sources.push({ source: 'extra_text', text: card.extraText })
  }

  return sources
}

const TEXT_RULES = [
  ['second_turn_one', 'second_turn_one', matchesSecondTurnOne],
  ['draw', 'draw', matchesDraw],
  ['deck_search', 'deck_search', matchesDeckSearch],
  ['cheer_acceleration', 'cheer_acceleration', matchesCheerAcceleration],
  ['cheer_recovery', 'cheer_recovery', matchesCheerRecovery],
  ['archive_recovery', 'archive_recovery', matchesArchiveRecovery],
  ['arts_boost', 'arts_boost', matchesArtsBoost],
  ['damage_reduction', 'damage_reduction', matchesDamageReduction],
  ['special_damage', 'special_damage', matchesSpecialDamage],
] as const satisfies readonly [EffectTag, string, (text: string) => boolean][]

function structuredAbilityTag(type: Ability['type']): EffectTag | undefined {
  if (type === 'bloom') return 'bloom_effect'
  if (type === 'collab') return 'collab_effect'
  if (type === 'gift') return 'gift'
  return undefined
}

export function deriveEffectTags(card: MergedCardCandidate): {
  effectTags: EffectTag[]
  evidence: EffectTagEvidence[]
} {
  const detected = new Set<EffectTag>()
  const evidence: EffectTagEvidence[] = []

  card.abilities.forEach((ability, sourceIndex) => {
    const tag = structuredAbilityTag(ability.type)
    if (tag) {
      detected.add(tag)
      evidence.push({
        tag,
        source: 'ability_type',
        sourceIndex,
        rule: `ability_type_${ability.type}`,
      })
    }
  })

  for (const source of collectEffectTextSources(card)) {
    for (const [tag, rule, matches] of TEXT_RULES) {
      if (matches(source.text)) {
        detected.add(tag)
        evidence.push({
          tag,
          source: source.source,
          ...(source.sourceIndex !== undefined
            ? { sourceIndex: source.sourceIndex }
            : {}),
          rule,
        })
      }
    }
  }

  return {
    effectTags: EFFECT_TAG_ORDER.filter((tag) => detected.has(tag)),
    evidence,
  }
}
