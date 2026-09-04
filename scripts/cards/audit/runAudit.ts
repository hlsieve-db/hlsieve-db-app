import { resolve } from 'node:path'

import { fetchCardDetails } from '../detailFetch/fetchCardDetails'
import { discoverCardEntries } from '../discovery/discoverCardEntries'
import { createHtmlFetcher } from '../discovery/fetchHtml'
import { runCardPipelineDryRun } from './runCardPipelineDryRun'

const OFFICIAL_FORM_URL = 'https://hololive-official-cardgame.com/cardlist/'
const discoveryFetcher = createHtmlFetcher({ minIntervalMs: 750 })
const discovery = await discoverCardEntries({
  formUrl: OFFICIAL_FORM_URL,
  fetchHtml: discoveryFetcher,
  stats: discoveryFetcher.stats,
})
const details = await fetchCardDetails(discovery, {
  cacheDirectory: resolve('.cache/cards/details'),
  minIntervalMs: 750,
  onProgress: (progress) => {
    const completed = progress.succeeded + progress.failed
    if (completed === progress.total || completed % 25 === 0) {
      console.error(
        `details ${completed}/${progress.total} cache=${progress.cacheHits} fetched=${progress.fetched} failed=${progress.failed}`,
      )
    }
  },
})

const result = runCardPipelineDryRun({
  discovery,
  details: details.results,
  restrictions: [],
  generatedAt: new Date().toISOString(),
})
console.log(JSON.stringify(result.report, null, 2))
if (!result.report.isPublishable) process.exitCode = 1
