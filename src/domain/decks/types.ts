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
  /**
   * The format this deck is built for, when it is not ordinary construction.
   *
   * Absent is the canonical way to say "ordinary construction", so a deck made
   * before formats existed and a deck made by someone who never opened the
   * setting are the same deck. Nothing rewrites an existing deck to add it.
   *
   * Kept as a plain string rather than a union of the known ids: a deck built
   * under a format a later build no longer defines is still that deck, and
   * narrowing the type here would turn it into invalid data.
   */
  regulationId?: string
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
