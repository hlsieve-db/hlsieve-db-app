import type { MergedCardCandidate } from '../merge/types'
import { deriveCriticalColors } from './deriveCriticalColors'
import { deriveEffectTags } from './deriveEffectTags'
import type { DerivedCardCandidate, DerivedEffects } from './types'

export function deriveCardEffects(card: MergedCardCandidate): DerivedEffects {
  const effectTags = deriveEffectTags(card)
  return {
    effectTags: effectTags.effectTags,
    criticalColors: deriveCriticalColors(card),
    evidence: effectTags.evidence,
  }
}

export function toDerivedCardCandidate(
  card: MergedCardCandidate,
): DerivedCardCandidate {
  const derived = deriveCardEffects(card)
  return {
    ...card,
    effectTags: derived.effectTags,
    criticalColors: derived.criticalColors,
  }
}
