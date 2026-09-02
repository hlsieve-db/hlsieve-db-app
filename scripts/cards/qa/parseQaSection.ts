import { load, type Cheerio, type CheerioAPI } from 'cheerio'
import type { AnyNode, Element } from 'domhandler'

import { cleanRawText, textWithBreaks } from '../parser/htmlTokens'
import type {
  ParsedQaSection,
  QaIssue,
  RawQaEntry,
  RawRelatedCard,
} from './types'

function textWithoutStructuralPrefix(
  container: Cheerio<Element>,
  prefix: 'Q' | 'A',
): string {
  const clone = container.clone()
  const prefixElement = clone.children('span').first()

  if (cleanRawText(prefixElement.text()) === prefix) {
    prefixElement.remove()
  }

  return textWithBreaks(clone)
}

function parseTitle(titleRaw: string): {
  qNumberRaw?: string
  publishedDateRaw?: string
} {
  const match = /^\s*([^\s（(]+)\s*[（(]([^）)]+)[）)]/.exec(titleRaw)
  if (!match) {
    return {}
  }

  const qNumberRaw = match[1]?.trim()
  const publishedDateRaw = match[2]?.trim()

  return {
    ...(qNumberRaw ? { qNumberRaw } : {}),
    ...(publishedDateRaw ? { publishedDateRaw } : {}),
  }
}

function findRelatedContainer(entry: Cheerio<Element>): Cheerio<AnyNode> {
  let sibling = entry.next()

  while (sibling.length > 0 && !sibling.hasClass('qa-List_Item')) {
    if (sibling.hasClass('relation')) {
      return sibling
    }
    sibling = sibling.next()
  }

  return entry.find('.relation')
}

function parseRelatedCards(
  $: CheerioAPI,
  container: Cheerio<AnyNode>,
): RawRelatedCard[] {
  if (container.length === 0) {
    return []
  }

  const text = textWithBreaks(container.children('p').slice(1))
  const cards: RawRelatedCard[] = []
  const cardPattern = /\[([^\]：]*?)(?:\s*：\s*([^\]]*))?\]/g

  for (const match of text.matchAll(cardPattern)) {
    const cardNumberRaw = match[1]?.trim()
    const nameRaw = match[2]?.trim()
    const matchingLink = container
      .find('a')
      .toArray()
      .map((element) => $(element))
      .find(
        (link) =>
          cardNumberRaw !== undefined &&
          cleanRawText(link.text()).includes(cardNumberRaw),
      )
    const hrefRaw = matchingLink?.attr('href')?.trim()

    cards.push({
      ...(cardNumberRaw ? { cardNumberRaw } : {}),
      ...(nameRaw ? { nameRaw } : {}),
      ...(hrefRaw ? { hrefRaw } : {}),
    })
  }

  return cards
}

export function parseQaSectionHtml(
  qaSectionHtmlRaw: string | undefined,
): ParsedQaSection {
  if (!qaSectionHtmlRaw?.trim()) {
    return { entries: [], warnings: [] }
  }

  const $ = load(qaSectionHtmlRaw, null, false)
  const entries: RawQaEntry[] = []
  const warnings: QaIssue[] = []

  $('#faq .qa-List > .qa-List_Item').each((sourceIndex, element) => {
    const entry = $(element)
    const question = entry.children('.qa-List_Txt-Q').first()
    const answer = entry.children('.qa-List_Txt-A').first()
    const questionRaw = textWithoutStructuralPrefix(question, 'Q')
    const answerRaw = textWithoutStructuralPrefix(answer, 'A')

    if (!questionRaw) {
      warnings.push({
        code: 'QA_MISSING_QUESTION',
        message: 'Q&A entry has no question text.',
        sourceIndex,
      })
    }
    if (!answerRaw) {
      warnings.push({
        code: 'QA_MISSING_ANSWER',
        message: 'Q&A entry has no answer text.',
        sourceIndex,
      })
    }
    if (!questionRaw || !answerRaw) {
      return
    }

    const titleRaw = cleanRawText(entry.children('.qa-List_Ttl').first().text())
    const title = parseTitle(titleRaw)
    const relatedCardsRaw = parseRelatedCards($, findRelatedContainer(entry))

    entries.push({
      ...title,
      questionRaw,
      answerRaw,
      relatedCardsRaw,
      sourceIndex,
    })
  })

  return { entries, warnings }
}
