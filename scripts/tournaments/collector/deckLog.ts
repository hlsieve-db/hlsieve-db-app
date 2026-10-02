import { load } from 'cheerio'

import type { DeckEntry } from '../../../src/domain/decks/types'
import type { TournamentDeck } from '../../../src/domain/tournaments/types'

const SECTION_NAMES = {
  oshi: '推しホロメン',
  main: 'メインデッキ',
  cheer: 'エールデッキ',
} as const

function parseCardNumber(title: string): string {
  const match = title.normalize('NFKC').match(/^([^\s:：]+)\s*[:：]\s*.+$/)
  if (!match?.[1] || !/^[A-Za-z0-9-]+$/.test(match[1])) {
    throw new Error(`Malformed Deck Log card title: ${title}`)
  }
  return match[1]
}

function parseSection(html: string, heading: string): DeckEntry[] {
  const $ = load(html)
  const sectionHeading = $('h3').filter(
    (_, element) => $(element).text().trim() === heading,
  )
  if (sectionHeading.length !== 1) {
    throw new Error(`Deck Log section is missing or ambiguous: ${heading}`)
  }
  const container = sectionHeading.first().next()
  const quantities = new Map<string, number>()
  container.find('.card-item').each((_, element) => {
    const image = $(element).find('img[title]').first()
    const title = image.attr('title')
    if (!title) throw new Error(`Deck Log card title is missing in ${heading}.`)
    const quantityText = $(element).find('.num').first().text().trim()
    if (!/^\d+$/.test(quantityText)) {
      throw new Error(`Deck Log quantity is missing or invalid in ${heading}.`)
    }
    const quantity = Number(quantityText)
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      throw new Error(`Deck Log quantity is missing or invalid in ${heading}.`)
    }
    const cardNumber = parseCardNumber(title)
    quantities.set(cardNumber, (quantities.get(cardNumber) ?? 0) + quantity)
  })
  if (quantities.size === 0)
    throw new Error(`Deck Log section is empty: ${heading}`)
  return [...quantities.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([cardNumber, quantity]) => ({ cardNumber, quantity }))
}

export function parseDeckLogHtml(html: string): TournamentDeck {
  return {
    oshi: parseSection(html, SECTION_NAMES.oshi),
    main: parseSection(html, SECTION_NAMES.main),
    cheer: parseSection(html, SECTION_NAMES.cheer),
  }
}
