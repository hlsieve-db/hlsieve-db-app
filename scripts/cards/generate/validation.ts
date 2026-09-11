import type { Card } from '../../../src/domain/cards/types'
import type { CardRestriction } from '../../../src/domain/decks/types'
import type { GenerationIssue } from './types'

const CARD_TYPES = new Set(['oshi', 'holomem', 'support', 'cheer'])
const OFFICIAL_QA_HOST = 'hololive-official-cardgame.com'

function isUrlWithProtocols(
  value: string,
  protocols: readonly string[],
): boolean {
  try {
    return protocols.includes(new URL(value).protocol)
  } catch {
    return false
  }
}

export function isValidUtcIsoDateTime(value: string): boolean {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(
      value,
    )
  if (!match) return false
  const parts = match.slice(1, 7).map(Number)
  const [year, month, day, hour, minute, second] = parts
  const millisecond = Number((match[7] ?? '').padEnd(3, '0'))
  const date = new Date(
    Date.UTC(
      year ?? 0,
      (month ?? 0) - 1,
      day,
      hour,
      minute,
      second,
      millisecond,
    ),
  )
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second &&
    date.getUTCMilliseconds() === millisecond
  )
}

export function validatePublicCard(card: Card): GenerationIssue[] {
  const errors: GenerationIssue[] = []
  const invalid = (path: string, message: string) =>
    errors.push({
      code: 'INVALID_PUBLIC_CARD',
      cardNumber: card.cardNumber,
      path,
      message,
    })

  if (!card.cardNumber.trim())
    invalid('cardNumber', 'cardNumber must be nonempty.')
  if (!card.name.trim()) invalid('name', 'name must be nonempty.')
  if (!CARD_TYPES.has(card.cardType))
    invalid('cardType', 'cardType is invalid.')
  for (const field of [
    'colors',
    'tags',
    'abilities',
    'arts',
    'batonPass',
    'effectTags',
    'criticalColors',
    'rarities',
    'products',
    'illustrators',
    'qas',
  ] as const) {
    if (!Array.isArray(card[field]))
      invalid(field, `${field} must be an array.`)
  }
  if (typeof card.searchText !== 'string') {
    invalid('searchText', 'searchText must be a string.')
  }
  if (Array.isArray(card.qas)) {
    card.qas.forEach((qa, index) => {
      if (!/^Q[1-9]\d*$/.test(qa.id))
        invalid(`qas[${index}].id`, 'id must be an official Q number.')
      if (!qa.question.trim())
        invalid(`qas[${index}].question`, 'question must be nonempty.')
      if (!qa.answer.trim())
        invalid(`qas[${index}].answer`, 'answer must be nonempty.')
      try {
        const officialUrl = new URL(qa.officialUrl)
        if (
          officialUrl.protocol !== 'https:' ||
          officialUrl.host !== OFFICIAL_QA_HOST ||
          officialUrl.hash !== '#faq'
        ) {
          invalid(
            `qas[${index}].officialUrl`,
            'officialUrl must use the official HTTPS host and #faq anchor.',
          )
        }
      } catch {
        invalid(`qas[${index}].officialUrl`, 'officialUrl must be valid.')
      }
      if (
        qa.publishedAt !== undefined &&
        !/^\d{4}-\d{2}-\d{2}$/.test(qa.publishedAt)
      ) {
        invalid(`qas[${index}].publishedAt`, 'publishedAt must use YYYY-MM-DD.')
      }
      if (
        !Array.isArray(qa.relatedCardNumbers) ||
        qa.relatedCardNumbers.length === 0 ||
        qa.relatedCardNumbers.some(
          (cardNumber) =>
            typeof cardNumber !== 'string' ||
            !/^[A-Za-z0-9]+-[A-Za-z0-9]+$/.test(cardNumber),
        )
      ) {
        invalid(
          `qas[${index}].relatedCardNumbers`,
          'relatedCardNumbers must contain official card numbers.',
        )
      }
    })
  }
  if (
    card.imageUrl !== undefined &&
    !isUrlWithProtocols(card.imageUrl, ['http:', 'https:'])
  ) {
    invalid('imageUrl', 'imageUrl must use http or https.')
  }
  if (
    card.officialUrl !== undefined &&
    !isUrlWithProtocols(card.officialUrl, ['https:'])
  ) {
    invalid('officialUrl', 'officialUrl must use https.')
  }
  return errors
}

function isValidDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  )
}

export function validateRestriction(
  restriction: CardRestriction,
  index: number,
): GenerationIssue[] {
  const errors: GenerationIssue[] = []
  const invalid = (path: string, message: string) =>
    errors.push({
      code: 'INVALID_RESTRICTION',
      cardNumber: restriction.cardNumber,
      path: `restrictions[${index}].${path}`,
      message,
    })

  if (!restriction.cardNumber.trim()) {
    invalid('cardNumber', 'cardNumber must be nonempty.')
  } else if (restriction.cardNumber !== restriction.cardNumber.trim()) {
    invalid('cardNumber', 'cardNumber must already be trimmed.')
  }
  if (
    !Number.isSafeInteger(restriction.maxCopies) ||
    restriction.maxCopies < 0
  ) {
    invalid('maxCopies', 'maxCopies must be a nonnegative safe integer.')
  }
  if (
    restriction.effectiveFrom !== undefined &&
    !isValidDateOnly(restriction.effectiveFrom)
  ) {
    invalid('effectiveFrom', 'effectiveFrom must be a valid YYYY-MM-DD date.')
  }
  if (
    restriction.effectiveTo !== undefined &&
    !isValidDateOnly(restriction.effectiveTo)
  ) {
    invalid('effectiveTo', 'effectiveTo must be a valid YYYY-MM-DD date.')
  }
  if (
    restriction.effectiveFrom !== undefined &&
    restriction.effectiveTo !== undefined &&
    restriction.effectiveFrom > restriction.effectiveTo
  ) {
    invalid('effectiveTo', 'effectiveFrom must not be after effectiveTo.')
  }
  if (restriction.note !== undefined && typeof restriction.note !== 'string') {
    invalid('note', 'note must be a string.')
  }
  return errors
}
