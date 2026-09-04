import type {
  Ability,
  Card,
  CardColor,
  RequiredCheer,
} from '../../../src/domain/cards/types'
import type { NormalizedArt, NormalizedProduct } from '../normalize/types'
import type { NormalizedQaEntry } from '../qa/types'

export type MergedPrinting = {
  officialId: string
  officialUrl: string
  isParallel: boolean
  imageUrl?: string
  rarity?: string
  products: NormalizedProduct[]
  illustrator?: string
}

export type SemanticConflict = {
  kind: 'semantic_conflict'
  cardNumber: string
  field: string
  canonicalOfficialId: string
  conflictingOfficialId: string
  canonicalValue: unknown
  conflictingValue: unknown
}

export type QaConflict = {
  kind: 'qa_conflict'
  cardNumber: string
  question: string
  variants: {
    answer: string
    officialIds: string[]
  }[]
}

export type MergeConflict = SemanticConflict | QaConflict

export type MergedCardCandidate = {
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
  batonPass: RequiredCheer[]
  abilities: Ability[]
  arts: NormalizedArt[]
  extraText?: string
  deckLimit?: number | null
  qas: NormalizedQaEntry[]
  imageUrl?: string
  officialUrl?: string
  rarities: string[]
  products: string[]
  illustrators: string[]
  releaseDate?: string
  printings: MergedPrinting[]
  conflicts: MergeConflict[]
}

export type MergeIssue = {
  code: string
  message: string
}

export type MergeResult<T> =
  | {
      ok: true
      value: T
      warnings: MergeIssue[]
    }
  | {
      ok: false
      errors: MergeIssue[]
    }
