export type CardColor =
  'white' | 'green' | 'red' | 'blue' | 'purple' | 'yellow' | 'colorless'

export type CriticalColor =
  'white' | 'green' | 'red' | 'blue' | 'purple' | 'yellow'

export type EffectTag =
  | 'second_turn_one'
  | 'bloom_effect'
  | 'collab_effect'
  | 'gift'
  | 'draw'
  | 'deck_search'
  | 'cheer_acceleration'
  | 'cheer_recovery'
  | 'archive_recovery'
  | 'arts_boost'
  | 'damage_reduction'
  | 'special_damage'

export type Ability = {
  type?: 'normal' | 'bloom' | 'collab' | 'gift'
  text: string
}

export type RequiredCheer = {
  color: CardColor | 'any'
  count: number
}

export type Art = {
  name: string
  requiredCheers: RequiredCheer[]
  damage?: number
  effectText?: string
  critical?: {
    color: CriticalColor
    bonusDamage?: number
  }
}

export type CardQa = {
  question: string
  answer: string
}

export type Card = {
  cardNumber: string
  name: string
  imageUrl?: string
  nameReading?: string
  cardType: 'oshi' | 'holomem' | 'support' | 'cheer'
  colors: CardColor[]
  bloomLevel?: 'debut' | 'first' | 'second' | 'spot'
  isBuzz: boolean
  debutType?: 'normal' | 'extra'
  hp?: number
  life?: number
  tags: string[]
  supportType?: 'staff' | 'item' | 'event' | 'tool' | 'mascot' | 'fan'
  isLimited?: boolean
  supportSearchCategory?: 'limited' | 'general' | 'tool' | 'fan'
  abilities: Ability[]
  arts: Art[]
  batonPass: RequiredCheer[]
  extraText?: string
  effectTags: EffectTag[]
  criticalColors: CriticalColor[]
  rarities: string[]
  products: string[]
  illustrators: string[]
  qas: CardQa[]
  deckLimit?: number | null
  releaseDate?: string
  searchText: string
  officialUrl?: string
}

export type CardPrinting = {
  officialId: string
  officialUrl: string
  isParallel: boolean
  imageUrl?: string
  product?: string
  rarity?: string
  illustrator?: string
  firstSeenAt: string
  lastCheckedAt: string
}

export type CardRecord = {
  card: Card
  printings: CardPrinting[]
  contentHash: string
  firstSeenAt: string
  lastCheckedAt: string
  lastChangedAt?: string
}

export type CardsDataFile = {
  format: 'holocard-cards'
  formatVersion: 1
  dataVersion: string
  generatedAt: string
  cards: Card[]
}
