import { load } from 'cheerio'

import type { DiscoveryIssue, PaginationDefinition } from './types'

export type PaginationParseResult =
  | { ok: true; value: PaginationDefinition; warnings: DiscoveryIssue[] }
  | { ok: false; errors: DiscoveryIssue[] }

const CONFIRMED_ENDPOINT_PATH = '/cardlist/cardsearch_ex'

function invalid(message: string, sourceUrl: string): PaginationParseResult {
  return {
    ok: false,
    errors: [
      {
        code: 'PAGINATION_CONFIG_INVALID',
        message,
        url: sourceUrl,
      },
    ],
  }
}

function canonicalFilterName(name: string): string {
  return name.replace(/\[\d+\]$/, '[]')
}

export function parsePaginationDefinition(
  html: string,
  sourceUrl: string,
): PaginationParseResult {
  const $ = load(html)
  const script = $('script')
    .toArray()
    .map((element) => $(element).text())
    .find(
      (text) =>
        text.includes('function exload') && text.includes('cardsearch_ex'),
    )
  if (!script) {
    return {
      ok: false,
      errors: [
        {
          code: 'PAGINATION_CONFIG_MISSING',
          message: 'Official pagination script was not found.',
          url: sourceUrl,
        },
      ],
    }
  }

  const currentMatch = script.match(/\bcur_page\s*=\s*(\d+)\s*;/)
  const maxMatch = script.match(/\bmax_page\s*=\s*(\d+)\s*;/)
  const methodMatch = script.match(/\btype\s*:\s*(['"])([^'"]+)\1/)
  const urlMatch = script.match(
    /\burl\s*:\s*(['"])([^'"]+)\1\s*\+\s*\(\s*cur_page\s*\+\s*1\s*\)\s*\+\s*(['"])([^'"]+)\3\s*\+\s*date\.getTime\(\)/,
  )
  if (!currentMatch || !maxMatch || !methodMatch || !urlMatch) {
    return invalid(
      'Official pagination values or request expression are malformed.',
      sourceUrl,
    )
  }

  const currentPage = Number(currentMatch[1])
  const maxPage = Number(maxMatch[1])
  if (
    !Number.isSafeInteger(currentPage) ||
    !Number.isSafeInteger(maxPage) ||
    currentPage < 1 ||
    maxPage < currentPage
  ) {
    return invalid('Official pagination page bounds are invalid.', sourceUrl)
  }
  if (methodMatch[2]?.toLowerCase() !== 'get') {
    return invalid('Official pagination transport must use GET.', sourceUrl)
  }

  const prefix = urlMatch[2] as string
  const suffix = urlMatch[4] as string
  const pageParameter = prefix.match(/[?&]([^?&=]+)=$/)
  const cacheBusterParameter = suffix.match(/^[?&]([^?&=]+)=$/)
  if (!pageParameter || !cacheBusterParameter) {
    return invalid(
      'Official pagination dynamic parameter names could not be derived.',
      sourceUrl,
    )
  }

  try {
    const requestUrl = new URL(`${prefix}${currentPage}${suffix}0`, sourceUrl)
    const source = new URL(sourceUrl)
    if (
      requestUrl.origin !== source.origin ||
      requestUrl.pathname !== CONFIRMED_ENDPOINT_PATH
    ) {
      return invalid(
        'Pagination endpoint is not the confirmed same-origin public frontend transport.',
        sourceUrl,
      )
    }

    const pageParameterName = decodeURIComponent(pageParameter[1] as string)
    const cacheBusterParameterName = decodeURIComponent(
      cacheBusterParameter[1] as string,
    )
    const sourceParameters = [...source.searchParams.entries()]
    const filterParameters = [...requestUrl.searchParams.entries()].filter(
      ([name]) =>
        name !== pageParameterName && name !== cacheBusterParameterName,
    )
    const unexpectedFilter = filterParameters.find(
      ([name, value]) =>
        !sourceParameters.some(
          ([sourceName, sourceValue]) =>
            canonicalFilterName(sourceName) === canonicalFilterName(name) &&
            sourceValue === value,
        ),
    )
    if (unexpectedFilter) {
      return invalid(
        `Pagination script introduced an unconfirmed filter parameter: ${unexpectedFilter[0]}.`,
        sourceUrl,
      )
    }

    return {
      ok: true,
      value: {
        sourceUrl,
        endpointUrl: `${requestUrl.origin}${requestUrl.pathname}`,
        method: 'get',
        currentPage,
        maxPage,
        filterParameters: filterParameters.map(([name, value]) => ({
          name,
          value,
        })),
        pageParameterName,
        cacheBusterParameterName,
      },
      warnings: [],
    }
  } catch {
    return invalid('Official pagination URL is invalid.', sourceUrl)
  }
}

export function buildPaginationUrl(
  definition: PaginationDefinition,
  page: number,
  timestamp = Date.now(),
): string {
  if (!Number.isSafeInteger(page) || page <= definition.currentPage) {
    throw new Error('Pagination page must follow the current page.')
  }
  if (page > definition.maxPage) {
    throw new Error('Pagination page exceeds the declared maximum page.')
  }
  const url = new URL(definition.endpointUrl)
  for (const parameter of definition.filterParameters) {
    url.searchParams.append(parameter.name, parameter.value)
  }
  url.searchParams.set(definition.pageParameterName, String(page))
  url.searchParams.set(definition.cacheBusterParameterName, String(timestamp))
  return url.toString()
}
