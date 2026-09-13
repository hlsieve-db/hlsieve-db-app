import type { Card, CardQa } from '../cards/types'
import { normalizeSearchText } from '../search/normalizeSearchText'

export type QaRelatedCard = {
  cardNumber: string
  name?: string
}

export type OfficialQaSearchRecord = Pick<
  CardQa,
  'id' | 'question' | 'answer' | 'officialUrl' | 'publishedAt'
> & {
  relatedCards: QaRelatedCard[]
  searchText: string
}

type MutableQaRecord = Omit<
  OfficialQaSearchRecord,
  'relatedCards' | 'searchText'
> & {
  relatedCardNumbers: Set<string>
}

function qaNumber(id: string): number {
  const match = /^q(\d+)$/i.exec(id)
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}

function compareQaIds(left: string, right: string): number {
  return (
    qaNumber(left) - qaNumber(right) ||
    left.localeCompare(right, 'ja', { numeric: true })
  )
}

export function buildOfficialQaSearchIndex(
  cards: readonly Card[],
): OfficialQaSearchRecord[] {
  const cardsByNumber = new Map(cards.map((card) => [card.cardNumber, card]))
  const records = new Map<string, MutableQaRecord>()

  for (const card of cards) {
    for (const qa of card.qas) {
      const existing = records.get(qa.id)
      const record = existing ?? {
        id: qa.id,
        question: qa.question,
        answer: qa.answer,
        officialUrl: qa.officialUrl,
        publishedAt: qa.publishedAt,
        relatedCardNumbers: new Set<string>(),
      }
      record.relatedCardNumbers.add(card.cardNumber)
      for (const cardNumber of qa.relatedCardNumbers) {
        record.relatedCardNumbers.add(cardNumber)
      }
      records.set(qa.id, record)
    }
  }

  return [...records.values()]
    .sort((left, right) => compareQaIds(left.id, right.id))
    .map(({ relatedCardNumbers, ...qa }) => {
      const relatedCards = [...relatedCardNumbers]
        .sort((left, right) =>
          left.localeCompare(right, 'en', { numeric: true }),
        )
        .map((cardNumber) => ({
          cardNumber,
          name: cardsByNumber.get(cardNumber)?.name,
        }))
      return {
        ...qa,
        relatedCards,
        searchText: normalizeSearchText(
          [
            qa.id,
            qa.question,
            qa.answer,
            ...relatedCards.flatMap(({ cardNumber, name }) => [
              cardNumber,
              name ?? '',
            ]),
          ].join(' '),
        ),
      }
    })
}

function exactQaIdForQuery(query: string): string | undefined {
  const normalized = normalizeSearchText(query).replaceAll(' ', '')
  if (/^\d+$/.test(normalized)) return `q${normalized}`
  return /^q\d+$/.test(normalized) ? normalized : undefined
}

function matchRank(
  record: OfficialQaSearchRecord,
  tokens: readonly string[],
): number {
  if (tokens.some((token) => normalizeSearchText(record.id).includes(token)))
    return 1
  if (
    tokens.some((token) => normalizeSearchText(record.question).includes(token))
  )
    return 2
  if (
    tokens.some((token) => normalizeSearchText(record.answer).includes(token))
  )
    return 3
  return 4
}

export function searchOfficialQa(
  index: readonly OfficialQaSearchRecord[],
  query: string,
): OfficialQaSearchRecord[] {
  const normalized = normalizeSearchText(query)
  if (!normalized) return []
  const tokens = normalized.split(' ')
  const exactId = exactQaIdForQuery(query)

  return index
    .filter((record) =>
      tokens.every((token) => record.searchText.includes(token)),
    )
    .map((record) => ({
      record,
      rank:
        normalizeSearchText(record.id) === exactId
          ? 0
          : matchRank(record, tokens),
    }))
    .sort(
      (left, right) =>
        left.rank - right.rank || compareQaIds(left.record.id, right.record.id),
    )
    .map(({ record }) => record)
}
