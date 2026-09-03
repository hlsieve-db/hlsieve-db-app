import { load } from 'cheerio'

import type { DiscoveryIssue } from './types'

export type TextViewParseResult =
  | {
      ok: true
      value: { parameterName: string; value: string }
      warnings: DiscoveryIssue[]
    }
  | { ok: false; errors: DiscoveryIssue[] }

export function parseTextViewDefinition(
  html: string,
  sourceUrl: string,
): TextViewParseResult {
  const $ = load(html)
  const galleryHref = $('.change-Btn_Gallery[href]').first().attr('href')
  const textHref = $('.change-Btn_Txt[href]').first().attr('href')
  if (!galleryHref || !textHref) {
    return {
      ok: false,
      errors: [
        {
          code: 'TEXT_VIEW_DEFINITION_MISSING',
          message: 'Gallery/text public view links were not found.',
          url: sourceUrl,
        },
      ],
    }
  }

  try {
    const gallery = new URL(galleryHref, sourceUrl)
    const text = new URL(textHref, sourceUrl)
    const differences = [...text.searchParams.entries()].filter(
      ([name, value]) => gallery.searchParams.get(name) !== value,
    )
    if (differences.length !== 1) throw new Error('ambiguous view parameters')
    const [parameterName, value] = differences[0] as [string, string]
    return { ok: true, value: { parameterName, value }, warnings: [] }
  } catch {
    return {
      ok: false,
      errors: [
        {
          code: 'TEXT_VIEW_DEFINITION_MISSING',
          message:
            'A unique text-view parameter could not be derived from public links.',
          url: sourceUrl,
        },
      ],
    }
  }
}
