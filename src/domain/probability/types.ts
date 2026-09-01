import type { CardColor, EffectTag } from '../cards/types'
import type { BloomFilterValue, CardTypeFilterValue } from '../search/types'

export type ConditionGroup = {
  mode: 'and' | 'or'
  conditions: ProbabilityCondition[]
}

export type ProbabilityCondition =
  | {
      type: 'card'
      cardNumber: string
    }
  | {
      type: 'color'
      value: CardColor
    }
  | {
      type: 'bloom'
      value: BloomFilterValue
    }
  | {
      type: 'cardType'
      value: CardTypeFilterValue
    }
  | {
      type: 'effectTag'
      value: EffectTag
    }

export type ProbabilityCalculation = {
  mode: 'draw' | 'topCheck'
  target: ConditionGroup
  cardsSeen: number
  thresholds: number[]
}

export type MulliganCondition = {
  target: ConditionGroup
  minimumCount: number
}
