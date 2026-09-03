import type { CriticalColor, EffectTag } from '../../../src/domain/cards/types'
import type { MergedCardCandidate } from '../merge/types'

export type EffectTextSource = {
  source: 'ability_text' | 'art_effect' | 'extra_text'
  sourceIndex?: number
  text: string
}

export type EffectTagEvidence = {
  tag: EffectTag
  source: 'ability_type' | EffectTextSource['source']
  sourceIndex?: number
  rule: string
}

export type DerivedEffects = {
  effectTags: EffectTag[]
  criticalColors: CriticalColor[]
  evidence: EffectTagEvidence[]
}

export type DerivedCardCandidate = MergedCardCandidate & {
  effectTags: EffectTag[]
  criticalColors: CriticalColor[]
}
