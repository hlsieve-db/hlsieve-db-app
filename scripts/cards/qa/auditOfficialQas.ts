import type { Card, CardQa } from '../../../src/domain/cards/types'

import { OFFICIAL_QA_HOST } from './officialQa'

export type OfficialQaAuditIssue = {
  code:
    | 'QA_DUPLICATE_ID'
    | 'QA_ID_CONFLICT'
    | 'QA_ORPHAN_RELATION'
    | 'QA_INVALID_URL'
    | 'QA_EMPTY_QUESTION'
    | 'QA_EMPTY_ANSWER'
  qaId: string
  cardNumber: string
  message: string
}

export type OfficialQaAuditReport = {
  totalOccurrences: number
  uniqueQas: number
  cardsWithQa: number
  cardsWithoutQa: number
  multiCardQas: number
  duplicateQaIds: number
  orphanQas: number
  invalidUrls: number
  emptyQuestions: number
  emptyAnswers: number
  issues: OfficialQaAuditIssue[]
  isValid: boolean
}

function isOfficialQaUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.host === OFFICIAL_QA_HOST &&
      url.hash === '#faq'
    )
  } catch {
    return false
  }
}

function qaContentSignature(qa: CardQa): string {
  return JSON.stringify({
    question: qa.question,
    answer: qa.answer,
    publishedAt: qa.publishedAt ?? null,
    relatedCardNumbers: [...new Set(qa.relatedCardNumbers)].sort(),
  })
}

export function auditOfficialQas(
  cards: readonly Card[],
  options: { requireEveryRelatedCard?: boolean } = {},
): OfficialQaAuditReport {
  const issues: OfficialQaAuditIssue[] = []
  const cardsByNumber = new Map(cards.map((card) => [card.cardNumber, card]))
  const occurrencesById = new Map<
    string,
    { qa: CardQa; signature: string; cardNumbers: Set<string> }
  >()
  const duplicateIds = new Set<string>()
  const orphanIds = new Set<string>()
  let totalOccurrences = 0
  let invalidUrls = 0
  let emptyQuestions = 0
  let emptyAnswers = 0

  for (const card of cards) {
    const idsOnCard = new Set<string>()
    for (const qa of card.qas) {
      totalOccurrences += 1
      if (idsOnCard.has(qa.id)) {
        duplicateIds.add(qa.id)
        issues.push({
          code: 'QA_DUPLICATE_ID',
          qaId: qa.id,
          cardNumber: card.cardNumber,
          message: `${qa.id} occurs more than once on ${card.cardNumber}.`,
        })
      }
      idsOnCard.add(qa.id)

      if (!qa.question.trim()) {
        emptyQuestions += 1
        issues.push({
          code: 'QA_EMPTY_QUESTION',
          qaId: qa.id,
          cardNumber: card.cardNumber,
          message: `${qa.id} has an empty question.`,
        })
      }
      if (!qa.answer.trim()) {
        emptyAnswers += 1
        issues.push({
          code: 'QA_EMPTY_ANSWER',
          qaId: qa.id,
          cardNumber: card.cardNumber,
          message: `${qa.id} has an empty answer.`,
        })
      }
      if (!isOfficialQaUrl(qa.officialUrl)) {
        invalidUrls += 1
        issues.push({
          code: 'QA_INVALID_URL',
          qaId: qa.id,
          cardNumber: card.cardNumber,
          message: `${qa.id} has a non-official or malformed URL.`,
        })
      }

      const signature = qaContentSignature(qa)
      const previous = occurrencesById.get(qa.id)
      if (!previous) {
        occurrencesById.set(qa.id, {
          qa,
          signature,
          cardNumbers: new Set([card.cardNumber]),
        })
      } else {
        previous.cardNumbers.add(card.cardNumber)
        if (previous.signature !== signature) {
          duplicateIds.add(qa.id)
          issues.push({
            code: 'QA_ID_CONFLICT',
            qaId: qa.id,
            cardNumber: card.cardNumber,
            message: `${qa.id} maps to conflicting official content or metadata.`,
          })
        }
      }
    }
  }

  for (const [qaId, occurrence] of occurrencesById) {
    const related = new Set(occurrence.qa.relatedCardNumbers)
    for (const cardNumber of occurrence.cardNumbers) {
      if (!related.has(cardNumber)) {
        orphanIds.add(qaId)
        issues.push({
          code: 'QA_ORPHAN_RELATION',
          qaId,
          cardNumber,
          message: `${qaId} is attached to ${cardNumber}, but the official relation does not include it.`,
        })
      }
    }
    for (const cardNumber of related) {
      const relatedCard = cardsByNumber.get(cardNumber)
      if (
        (relatedCard && !relatedCard.qas.some((qa) => qa.id === qaId)) ||
        (!relatedCard && options.requireEveryRelatedCard !== false)
      ) {
        orphanIds.add(qaId)
        issues.push({
          code: 'QA_ORPHAN_RELATION',
          qaId,
          cardNumber,
          message: `${qaId} references ${cardNumber}, but that logical Card does not carry the Q&A.`,
        })
      }
    }
  }

  issues.sort((left, right) =>
    `${left.qaId}\0${left.cardNumber}\0${left.code}`.localeCompare(
      `${right.qaId}\0${right.cardNumber}\0${right.code}`,
      'en',
    ),
  )
  const report: OfficialQaAuditReport = {
    totalOccurrences,
    uniqueQas: occurrencesById.size,
    cardsWithQa: cards.filter((card) => card.qas.length > 0).length,
    cardsWithoutQa: cards.filter((card) => card.qas.length === 0).length,
    multiCardQas: [...occurrencesById.values()].filter(
      (item) => new Set(item.qa.relatedCardNumbers).size > 1,
    ).length,
    duplicateQaIds: duplicateIds.size,
    orphanQas: orphanIds.size,
    invalidUrls,
    emptyQuestions,
    emptyAnswers,
    issues,
    isValid: issues.length === 0,
  }
  return report
}
