import type {
  NormalizedQaEntry,
  NormalizedQaSection,
  QaIssue,
  RawQaEntry,
} from './types'

function normalizeBody(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

function normalizeQNumber(
  value: string | undefined,
  sourceIndex: number,
  warnings: QaIssue[],
): number | undefined {
  if (value === undefined) {
    return undefined
  }

  const match = /^Q(\d+)$/.exec(value.trim())
  const parsed = match?.[1] === undefined ? Number.NaN : Number(match[1])
  if (!Number.isSafeInteger(parsed)) {
    warnings.push({
      code: 'QA_INVALID_NUMBER',
      message: `Invalid Q&A number: ${value}`,
      sourceIndex,
    })
    return undefined
  }

  return parsed
}

function isValidCalendarDate(
  year: number,
  month: number,
  day: number,
): boolean {
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false
  }

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ]

  return day <= (daysInMonth[month - 1] ?? 0)
}

function normalizePublishedDate(
  value: string | undefined,
  sourceIndex: number,
  warnings: QaIssue[],
): string | undefined {
  if (value === undefined) {
    return undefined
  }

  const match = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(value.trim())
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    if (isValidCalendarDate(year, month, day)) {
      return `${match[1]}-${match[2]}-${match[3]}`
    }
  }

  warnings.push({
    code: 'QA_INVALID_DATE',
    message: `Invalid Q&A published date: ${value}`,
    sourceIndex,
  })
  return undefined
}

function normalizeRelatedCardNumbers(
  entry: RawQaEntry,
  warnings: QaIssue[],
): string[] {
  const values: string[] = []

  for (const relatedCard of entry.relatedCardsRaw) {
    const cardNumber = relatedCard.cardNumberRaw?.trim()
    if (!cardNumber || !/^[A-Za-z0-9]+-[A-Za-z0-9]+$/.test(cardNumber)) {
      warnings.push({
        code: 'QA_INVALID_RELATED_CARD',
        message: `Invalid related card number: ${cardNumber ?? '(missing)'}`,
        sourceIndex: entry.sourceIndex,
      })
      continue
    }
    if (!values.includes(cardNumber)) {
      values.push(cardNumber)
    }
  }

  return values
}

export function normalizeQaEntries(entries: RawQaEntry[]): NormalizedQaSection {
  const warnings: QaIssue[] = []
  const value: NormalizedQaEntry[] = entries.flatMap((entry) => {
    const question = normalizeBody(entry.questionRaw)
    const answer = normalizeBody(entry.answerRaw)
    if (!question || !answer) {
      warnings.push({
        code: !question ? 'QA_MISSING_QUESTION' : 'QA_MISSING_ANSWER',
        message: `Q&A entry ${entry.sourceIndex} has empty normalized text.`,
        sourceIndex: entry.sourceIndex,
      })
      return []
    }

    const qNumber = normalizeQNumber(
      entry.qNumberRaw,
      entry.sourceIndex,
      warnings,
    )
    const publishedDate = normalizePublishedDate(
      entry.publishedDateRaw,
      entry.sourceIndex,
      warnings,
    )

    return [
      {
        question,
        answer,
        ...(qNumber !== undefined ? { qNumber } : {}),
        ...(publishedDate ? { publishedDate } : {}),
        relatedCardNumbers: normalizeRelatedCardNumbers(entry, warnings),
        sourceIndex: entry.sourceIndex,
      },
    ]
  })

  return { value, warnings }
}
