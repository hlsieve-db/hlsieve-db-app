import type { Card, CardQa } from '../../../src/domain/cards/types'

import { buildOfficialQaUrl } from './officialQa'

export type OfficialQaLinkIssue = {
  code: 'QA_ID_CONFLICT' | 'QA_ORPHAN_RELATION' | 'QA_INVALID_URL'
  qaId: string
  cardNumber: string
  message: string
}

export type OfficialQaLinkResult =
  { ok: true; cards: Card[] } | { ok: false; issues: OfficialQaLinkIssue[] }

export type OfficialQaLinkOptions = {
  requireEveryRelatedCard?: boolean
}

type RegistryEntry = {
  qa: CardQa
  relatedCardNumbers: Set<string>
  attachedCardNumbers: Set<string>
}

function contentSignature(qa: CardQa): string {
  return JSON.stringify({
    question: qa.question,
    answer: qa.answer,
    publishedAt: qa.publishedAt ?? null,
  })
}

function compareQaId(left: CardQa, right: CardQa): number {
  return Number(right.id.slice(1)) - Number(left.id.slice(1))
}

export function linkOfficialQas(
  cards: readonly Card[],
  options: OfficialQaLinkOptions = {},
): OfficialQaLinkResult {
  const registry = new Map<string, RegistryEntry>()
  const issues: OfficialQaLinkIssue[] = []
  const cardsByNumber = new Map(cards.map((card) => [card.cardNumber, card]))

  for (const card of cards) {
    for (const qa of card.qas) {
      const previous = registry.get(qa.id)
      if (!previous) {
        registry.set(qa.id, {
          qa,
          relatedCardNumbers: new Set(qa.relatedCardNumbers),
          attachedCardNumbers: new Set([card.cardNumber]),
        })
        continue
      }
      previous.attachedCardNumbers.add(card.cardNumber)
      for (const related of qa.relatedCardNumbers) {
        previous.relatedCardNumbers.add(related)
      }
      if (contentSignature(previous.qa) !== contentSignature(qa)) {
        issues.push({
          code: 'QA_ID_CONFLICT',
          qaId: qa.id,
          cardNumber: card.cardNumber,
          message: `${qa.id} maps to conflicting official question, answer, or publication date.`,
        })
      }
    }
  }

  for (const [qaId, entry] of registry) {
    for (const cardNumber of entry.relatedCardNumbers) {
      if (
        options.requireEveryRelatedCard !== false &&
        !cardsByNumber.has(cardNumber)
      ) {
        issues.push({
          code: 'QA_ORPHAN_RELATION',
          qaId,
          cardNumber,
          message: `${qaId} references unknown logical Card ${cardNumber}.`,
        })
      }
    }
    for (const cardNumber of entry.attachedCardNumbers) {
      if (!entry.relatedCardNumbers.has(cardNumber)) {
        issues.push({
          code: 'QA_ORPHAN_RELATION',
          qaId,
          cardNumber,
          message: `${qaId} is attached to ${cardNumber} without an official relation.`,
        })
      }
    }
  }
  if (issues.length > 0) return { ok: false, issues }

  const linked = cards.map((card) => {
    const officialUrl = card.officialUrl
      ? buildOfficialQaUrl(card.officialUrl)
      : undefined
    const qas = [...registry.values()]
      .filter((entry) => entry.relatedCardNumbers.has(card.cardNumber))
      .map((entry) => ({
        ...entry.qa,
        officialUrl: officialUrl ?? '',
        relatedCardNumbers: [...entry.relatedCardNumbers].sort((left, right) =>
          left.localeCompare(right, 'en'),
        ),
      }))
      .sort(compareQaId)
    if (qas.length > 0 && !officialUrl) {
      issues.push({
        code: 'QA_INVALID_URL',
        qaId: qas[0]?.id ?? '',
        cardNumber: card.cardNumber,
        message: `Cannot build an official Q&A URL for ${card.cardNumber}.`,
      })
    }
    return { ...card, qas }
  })

  return issues.length > 0 ? { ok: false, issues } : { ok: true, cards: linked }
}
