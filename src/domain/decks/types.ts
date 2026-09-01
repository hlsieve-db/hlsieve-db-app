export type DeckCard = {
  cardNumber: string
  quantity: number
  order: number
}

export type Deck = {
  id: string
  name: string
  oshi: DeckCard[]
  main: DeckCard[]
  cheer: DeckCard[]
  createdAt: string
  updatedAt: string
}

export type CardRestriction = {
  cardNumber: string
  maxCopies: number
  effectiveFrom?: string
  effectiveTo?: string
  note?: string
}

export type DeckWarning = {
  code:
    | 'oshi_count'
    | 'main_count'
    | 'cheer_count'
    | 'card_limit'
    | 'restricted_card'
    | 'wrong_section'
    | 'unknown_card'
  message: string
  cardNumber?: string
}

export type DeckValidationResult = {
  isValid: boolean
  warnings: DeckWarning[]
}

export type RestrictionsDataFile = {
  format: 'holocard-restrictions'
  formatVersion: 1
  dataVersion?: string
  generatedAt: string
  restrictions: CardRestriction[]
}
