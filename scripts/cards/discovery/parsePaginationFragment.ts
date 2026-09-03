import { load } from 'cheerio'

import { parseDiscoveryPage } from './parseDiscoveryPage'
import type {
  DiscoveryIssue,
  DiscoveryMode,
  DiscoveryPageResult,
} from './types'

export function parsePaginationFragment(
  fragment: string,
  sourceUrl: string,
  mode: DiscoveryMode,
): DiscoveryPageResult {
  const $ = load(fragment, null, false)
  const roots = $.root().children()
  const entries = roots.filter('li.ex-item')
  if (roots.length === 0 || entries.length !== roots.length) {
    const issue: DiscoveryIssue = {
      code: 'PAGINATION_FRAGMENT_INVALID',
      message:
        'Pagination response must contain only top-level li.ex-item elements.',
      mode,
      url: sourceUrl,
    }
    return {
      mode,
      searchUrl: sourceUrl,
      rawEntryCount: 0,
      parsedEntryCount: 0,
      cards: [],
      specialEntries: [],
      duplicateOfficialIdCount: 0,
      partitionCount: 0,
      isComplete: false,
      issues: [issue],
    }
  }

  const wrapped = `<div id="content"><p class="cardlist-Result_Target_Num"><span class="num">${entries.length}</span></p><ul class="cardlist-Result_List cardlist-Result_List_Txt">${fragment}</ul></div>`
  return parseDiscoveryPage(wrapped, sourceUrl, mode)
}
