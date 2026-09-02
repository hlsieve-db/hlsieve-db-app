import type {
  Ability,
  Art,
  Card,
  CardColor,
  RequiredCheer,
} from '../../../src/domain/cards/types'

export type NormalizedProduct = {
  name: string
  category?: string
  releaseDate?: string
  detailUrl?: string
}

export type NormalizedArt = Art & {
  text: string
}

export type NormalizedCardCandidate = {
  officialId: string
  officialUrl: string
  cardNumber: string
  name: string
  imageUrl?: string
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
  batonPass: RequiredCheer[]
  abilities: Ability[]
  arts: NormalizedArt[]
  extraText?: string
  deckLimit?: number | null
  rarity?: string
  products: NormalizedProduct[]
  illustrator?: string
}

export type NormalizedListEntry =
  | {
      kind: 'card'
      officialId: string
      cardNumber: string
      name: string
      detailUrl: string
      imageUrl?: string
    }
  | {
      kind: 'special'
      officialId?: string
      name: string
      detailUrl?: string
      imageUrl?: string
    }

export type NormalizeIssue = {
  code: string
  message: string
}

export type NormalizeResult<T> =
  | {
      ok: true
      value: T
      warnings: NormalizeIssue[]
    }
  | {
      ok: false
      errors: NormalizeIssue[]
    }
