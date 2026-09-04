import { resolve } from 'node:path'

import { runCardPipelineDryRun } from '../audit/runCardPipelineDryRun'
import { fetchCardDetails } from '../detailFetch/fetchCardDetails'
import { discoverCardEntries } from '../discovery/discoverCardEntries'
import { createHtmlFetcher } from '../discovery/fetchHtml'
import { publishCardsSnapshot } from './publishCardsSnapshot'

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
const pipeline = runCardPipelineDryRun({
  discovery,
  details: details.results,
  restrictions: [],
  generatedAt: new Date().toISOString(),
})
const publication = await publishCardsSnapshot(pipeline, {
  outputPath: resolve('public/cards.json'),
})

console.log(
  JSON.stringify(
    {
      discovery: {
        isComplete: discovery.isComplete,
        cards: discovery.cards.length,
        requests: discovery.requestCount,
        retries: discovery.retryCount,
      },
      details: {
        total: details.total,
        succeeded: details.succeeded,
        fetched: details.fetched,
        cacheHits: details.cacheHits,
        failed: details.failed,
        requests: details.requestCount,
        retries: details.retryCount,
      },
      audit: pipeline.report,
      publication,
    },
    null,
    2,
  ),
)
if (!publication.ok) process.exitCode = 1
