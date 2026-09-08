export type DeckCard = {
  cardNumber: string
  quantity: number
  order: number
}

export type DeckId = string

export type DeckEntry = {
  cardNumber: string
  quantity: number
}

export type Deck = {
  id: DeckId
  name: string
  entries: DeckEntry[]
  createdAt: string
  updatedAt: string
}

export type CardRestriction = {
  cardNumber: string
  maxCopies: number
  effectiveFrom: string
  effectiveTo?: string
  note?: string
}

export type DeckZone = 'oshi' | 'main' | 'cheer'

export type DeckLegalityStatus = 'incomplete' | 'invalid' | 'legal'

export type DeckLegalityIssue =
  | {
      code: 'oshi_count' | 'main_count' | 'cheer_count'
      actual: number
      expected: number
    }
  | {
      code: 'copy_limit' | 'restricted_card'
      cardNumber: string
      actual: number
      max: number
    }
  | {
      code: 'unknown_card' | 'unsupported_card_type'
      cardNumber: string
      actual: number
    }

export type DeckLegalityResult = {
  isLegal: boolean
  status: DeckLegalityStatus
  oshiCount: number
  mainCount: number
  cheerCount: number
  totalCount: number
  issues: DeckLegalityIssue[]
}

export type RestrictionsDataFile = {
  format: 'holocard-restrictions'
  formatVersion: 1
  dataVersion?: string
  generatedAt: string
  restrictions: CardRestriction[]
}
