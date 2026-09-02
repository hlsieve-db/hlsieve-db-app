export type RawRelatedCard = {
  cardNumberRaw?: string
  nameRaw?: string
  hrefRaw?: string
}

export type RawQaEntry = {
  qNumberRaw?: string
  publishedDateRaw?: string
  questionRaw: string
  answerRaw: string
  relatedCardsRaw: RawRelatedCard[]
  sourceIndex: number
}

export type NormalizedQaEntry = {
  question: string
  answer: string
  qNumber?: number
  publishedDate?: string
  relatedCardNumbers: string[]
  sourceIndex: number
}

export type QaIssue = {
  code: string
  message: string
  sourceIndex?: number
}

export type ParsedQaSection = {
  entries: RawQaEntry[]
  warnings: QaIssue[]
}

export type NormalizedQaSection = {
  value: NormalizedQaEntry[]
  warnings: QaIssue[]
}
