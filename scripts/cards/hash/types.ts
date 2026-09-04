import type {
  Ability,
  Card,
  CardColor,
  CriticalColor,
  EffectTag,
  RequiredCheer,
} from '../../../src/domain/cards/types'

export type JsonPrimitive = null | boolean | number | string
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue | undefined }

export type ContentHashAbility = Pick<Ability, 'type' | 'text'>
export type ContentHashRequiredCheer = Pick<RequiredCheer, 'color' | 'count'>

export type ContentHashArt = {
  name: string
  requiredCheers: ContentHashRequiredCheer[]
  damage?: number
  effectText?: string
  critical?: {
    color: CriticalColor
    bonusDamage?: number
  }
}

export type ContentHashQa = {
  question: string
  answer: string
}

export type ContentHashProduct = {
  name: string
  category?: string
  releaseDate?: string
  detailUrl?: string
}

export type ContentHashPrinting = {
  officialId: string
  officialUrl: string
  isParallel: boolean
  imageUrl?: string
  rarity?: string
  products: ContentHashProduct[]
  illustrator?: string
}

export type ContentHashSemanticConflict = {
  kind: 'semantic_conflict'
  cardNumber: string
  field: string
  canonicalOfficialId: string
  conflictingOfficialId: string
  canonicalValue?: JsonValue
  conflictingValue?: JsonValue
}

export type ContentHashQaConflict = {
  kind: 'qa_conflict'
  cardNumber: string
  question: string
  variants: {
    answer: string
    officialIds: string[]
  }[]
}

export type ContentHashConflict =
  ContentHashSemanticConflict | ContentHashQaConflict

export type CardContentHashPayload = {
  cardNumber: string
  name: string
  cardType: Card['cardType']
  isBuzz: boolean
  colors: CardColor[]
  bloomLevel?: Card['bloomLevel']
  debutType?: Card['debutType']
  hp?: number
  life?: number
  tags: string[]
  supportType?: Card['supportType']
  isLimited: boolean
  supportSearchCategory?: Card['supportSearchCategory']
  batonPass: ContentHashRequiredCheer[]
  abilities: ContentHashAbility[]
  arts: ContentHashArt[]
  extraText?: string
  deckLimit?: number | null
  effectTags: EffectTag[]
  criticalColors: CriticalColor[]
  qas: ContentHashQa[]
  imageUrl?: string
  officialUrl?: string
  rarities: string[]
  products: string[]
  illustrators: string[]
  releaseDate?: string
  printings: ContentHashPrinting[]
  conflicts: ContentHashConflict[]
}
