import { buildContentHashPayload } from '../hash/buildContentHashPayload'
import type {
  CardContentHashPayload,
  ContentHashQaConflict,
  ContentHashSemanticConflict,
} from '../hash/types'
import type { SearchIndexedCardCandidate } from '../searchIndex/types'
import type { DiffCategory } from './types'

type GameContentPayload = Pick<
  CardContentHashPayload,
  | 'cardType'
  | 'isBuzz'
  | 'colors'
  | 'bloomLevel'
  | 'debutType'
  | 'hp'
  | 'life'
  | 'tags'
  | 'supportType'
  | 'isLimited'
  | 'supportSearchCategory'
  | 'batonPass'
  | 'abilities'
  | 'arts'
  | 'extraText'
  | 'deckLimit'
>

type QaPayload = {
  qas: CardContentHashPayload['qas']
  conflicts: ContentHashQaConflict[]
}

type PrintingPayload = Pick<
  CardContentHashPayload,
  'imageUrl' | 'officialUrl' | 'printings'
> & {
  conflicts: ContentHashSemanticConflict[]
}

type MetadataPayload = Pick<
  CardContentHashPayload,
  'name' | 'rarities' | 'products' | 'illustrators' | 'releaseDate'
>

type DerivedPayload = Pick<
  CardContentHashPayload,
  'effectTags' | 'criticalColors'
>

export type CardDiffCategoryPayloads = {
  game_content: GameContentPayload
  qa: QaPayload
  printing: PrintingPayload
  metadata: MetadataPayload
  derived: DerivedPayload
}

export const HASH_FIELD_CATEGORIES = {
  name: 'metadata',
  cardType: 'game_content',
  isBuzz: 'game_content',
  colors: 'game_content',
  bloomLevel: 'game_content',
  debutType: 'game_content',
  hp: 'game_content',
  life: 'game_content',
  tags: 'game_content',
  supportType: 'game_content',
  isLimited: 'game_content',
  supportSearchCategory: 'game_content',
  batonPass: 'game_content',
  abilities: 'game_content',
  arts: 'game_content',
  extraText: 'game_content',
  deckLimit: 'game_content',
  effectTags: 'derived',
  criticalColors: 'derived',
  qas: 'qa',
  imageUrl: 'printing',
  officialUrl: 'printing',
  rarities: 'metadata',
  products: 'metadata',
  illustrators: 'metadata',
  releaseDate: 'metadata',
  printings: 'printing',
  conflicts: ['qa', 'printing'],
} as const satisfies Record<
  Exclude<keyof CardContentHashPayload, 'cardNumber'>,
  DiffCategory | readonly DiffCategory[]
>

export function buildCategoryPayloads(
  card: SearchIndexedCardCandidate,
): CardDiffCategoryPayloads {
  const payload = buildContentHashPayload(card)
  const qaConflicts = payload.conflicts.filter(
    (conflict): conflict is ContentHashQaConflict =>
      conflict.kind === 'qa_conflict',
  )
  const semanticConflicts = payload.conflicts.filter(
    (conflict): conflict is ContentHashSemanticConflict =>
      conflict.kind === 'semantic_conflict',
  )

  return {
    game_content: {
      cardType: payload.cardType,
      isBuzz: payload.isBuzz,
      colors: payload.colors,
      ...(payload.bloomLevel !== undefined
        ? { bloomLevel: payload.bloomLevel }
        : {}),
      ...(payload.debutType !== undefined
        ? { debutType: payload.debutType }
        : {}),
      ...(payload.hp !== undefined ? { hp: payload.hp } : {}),
      ...(payload.life !== undefined ? { life: payload.life } : {}),
      tags: payload.tags,
      ...(payload.supportType !== undefined
        ? { supportType: payload.supportType }
        : {}),
      isLimited: payload.isLimited,
      ...(payload.supportSearchCategory !== undefined
        ? { supportSearchCategory: payload.supportSearchCategory }
        : {}),
      batonPass: payload.batonPass,
      abilities: payload.abilities,
      arts: payload.arts,
      ...(payload.extraText !== undefined
        ? { extraText: payload.extraText }
        : {}),
      ...(payload.deckLimit !== undefined
        ? { deckLimit: payload.deckLimit }
        : {}),
    },
    qa: { qas: payload.qas, conflicts: qaConflicts },
    printing: {
      ...(payload.imageUrl !== undefined ? { imageUrl: payload.imageUrl } : {}),
      ...(payload.officialUrl !== undefined
        ? { officialUrl: payload.officialUrl }
        : {}),
      printings: payload.printings,
      conflicts: semanticConflicts,
    },
    metadata: {
      name: payload.name,
      rarities: payload.rarities,
      products: payload.products,
      illustrators: payload.illustrators,
      ...(payload.releaseDate !== undefined
        ? { releaseDate: payload.releaseDate }
        : {}),
    },
    derived: {
      effectTags: payload.effectTags,
      criticalColors: payload.criticalColors,
    },
  }
}
