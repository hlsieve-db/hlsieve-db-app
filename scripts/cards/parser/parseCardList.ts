import { load } from 'cheerio'

import { cleanRawText, parseImageRef, resolveHttpUrl } from './htmlTokens'
import type {
  ParseIssue,
  ParseResult,
  RawCardList,
  RawCardListEntry,
} from './types'

function parseListSourceUrl(sourceUrl: string): ParseResult<URL> {
  try {
    const url = new URL(sourceUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Unsupported scheme')
    }

    return { ok: true, value: url, warnings: [] }
  } catch {
    return {
      ok: false,
      errors: [
        {
          code: 'INVALID_SOURCE_URL',
          message: 'sourceUrl must be a valid http or https URL.',
        },
      ],
    }
  }
}

export function parseCardListHtml(
  html: string,
  sourceUrl: string,
): ParseResult<RawCardList> {
  const parsedSource = parseListSourceUrl(sourceUrl)
  if (!parsedSource.ok) {
    return parsedSource
  }

  const $ = load(html, null, false)
  if ($('#content').length === 0) {
    return {
      ok: false,
      errors: [
        {
          code: 'MISSING_CONTENT_ROOT',
          message: 'The #content root was not found.',
        },
      ],
    }
  }

  const list = $('.cardlist-Result_List').first()
  if (list.length === 0) {
    return {
      ok: false,
      errors: [
        {
          code: 'MISSING_LIST_ROOT',
          message: 'The card list root was not found.',
        },
      ],
    }
  }

  const warnings: ParseIssue[] = []
  const entries: RawCardListEntry[] = []

  list.children('li').each((index, element) => {
    const item = $(element)
    const nameRaw = cleanRawText(item.find('.name').first().text())
    if (!nameRaw) {
      warnings.push({
        code: 'LIST_ENTRY_MISSING_NAME',
        message: `List entry ${index} was skipped because it has no name.`,
      })
      return
    }

    const anchor = item.children('a').first()
    const detailUrl = resolveHttpUrl(anchor.attr('href'), sourceUrl)
    let officialId: string | undefined
    if (detailUrl) {
      const candidate = new URL(detailUrl).searchParams.get('id')
      if (candidate && /^\d+$/.test(candidate)) {
        officialId = candidate
      }
    }

    const rawNumberValue = cleanRawText(item.find('.number').first().text())
    const cardNumberRaw =
      rawNumberValue && rawNumberValue !== 'null' ? rawNumberValue : undefined
    if (rawNumberValue === 'null') {
      warnings.push({
        code: 'LIST_ENTRY_NULL_CARD_NUMBER',
        message: `List entry ${index} contains the literal null card-number sentinel.`,
      })
    }

    const image = parseImageRef(
      item.find('> a > .img.w100 > img').first(),
      sourceUrl,
    )

    entries.push({
      nameRaw,
      ...(detailUrl ? { detailUrl } : {}),
      ...(officialId ? { officialId } : {}),
      ...(cardNumberRaw ? { cardNumberRaw } : {}),
      ...(image ? { image } : {}),
      textRaw: cleanRawText(item.text()),
    })
  })

  if (entries.length === 0) {
    return {
      ok: false,
      errors: [
        {
          code: 'NO_VALID_LIST_ENTRIES',
          message: 'The list does not contain any entries with a name.',
        },
      ],
    }
  }

  return {
    ok: true,
    warnings,
    value: {
      sourceUrl,
      entries,
    },
  }
}
