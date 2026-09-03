import type { Card } from '../../../src/domain/cards/types'
import type { SearchIndexedCardCandidate } from '../searchIndex/types'
import type { GenerationResult, PublicCardOptions } from './types'
import { validatePublicCard } from './validation'

export function toPublicCard(
  candidate: SearchIndexedCardCandidate,
  options: PublicCardOptions = {},
): GenerationResult<Card> {
  const card: Card = {
    cardNumber: candidate.cardNumber,
    name: candidate.name,
    ...(candidate.imageUrl !== undefined
      ? { imageUrl: candidate.imageUrl }
      : {}),
    ...(options.nameReading !== undefined
      ? { nameReading: options.nameReading }
      : {}),
    cardType: candidate.cardType,
    colors: [...candidate.colors],
    ...(candidate.bloomLevel !== undefined
      ? { bloomLevel: candidate.bloomLevel }
      : {}),
    isBuzz: candidate.isBuzz,
    ...(candidate.debutType !== undefined
      ? { debutType: candidate.debutType }
      : {}),
    ...(candidate.hp !== undefined ? { hp: candidate.hp } : {}),
    ...(candidate.life !== undefined ? { life: candidate.life } : {}),
    tags: [...candidate.tags],
    ...(candidate.supportType !== undefined
      ? { supportType: candidate.supportType }
      : {}),
    isLimited: candidate.isLimited,
    ...(candidate.supportSearchCategory !== undefined
      ? { supportSearchCategory: candidate.supportSearchCategory }
      : {}),
    abilities: candidate.abilities.map((ability) => ({ ...ability })),
    arts: candidate.arts.map((art) => ({
      name: art.name,
      requiredCheers: art.requiredCheers.map((cheer) => ({ ...cheer })),
      ...(art.damage !== undefined ? { damage: art.damage } : {}),
      ...(art.effectText !== undefined ? { effectText: art.effectText } : {}),
      ...(art.critical !== undefined ? { critical: { ...art.critical } } : {}),
    })),
    batonPass: candidate.batonPass.map((cheer) => ({ ...cheer })),
    ...(candidate.extraText !== undefined
      ? { extraText: candidate.extraText }
      : {}),
    effectTags: [...candidate.effectTags],
    criticalColors: [...candidate.criticalColors],
    rarities: [...candidate.rarities],
    products: [...candidate.products],
    illustrators: [...candidate.illustrators],
    qas: candidate.qas.map((qa) => ({
      question: qa.question,
      answer: qa.answer,
    })),
    ...(candidate.deckLimit !== undefined
      ? { deckLimit: candidate.deckLimit }
      : {}),
    ...(candidate.releaseDate !== undefined
      ? { releaseDate: candidate.releaseDate }
      : {}),
    searchText: candidate.searchText,
    ...(candidate.officialUrl !== undefined
      ? { officialUrl: candidate.officialUrl }
      : {}),
  }

  const errors = validatePublicCard(card)
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, value: card, warnings: [] }
}
