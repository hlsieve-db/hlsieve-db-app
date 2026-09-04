import { resolve } from 'node:path'

import { discoverCardEntries } from '../discovery/discoverCardEntries'
import { createHtmlFetcher } from '../discovery/fetchHtml'
import { fetchCardDetails } from './fetchCardDetails'

const OFFICIAL_FORM_URL = 'https://hololive-official-cardgame.com/cardlist/'
const cacheDirectory = resolve('.cache/cards/details')

const discoveryFetcher = createHtmlFetcher({ minIntervalMs: 750 })
const discovery = await discoverCardEntries({
  formUrl: OFFICIAL_FORM_URL,
  fetchHtml: discoveryFetcher,
  stats: discoveryFetcher.stats,
})

let lastReported = 0
const report = await fetchCardDetails(discovery, {
  cacheDirectory,
  minIntervalMs: 750,
  onProgress: (progress) => {
    const completed = progress.succeeded + progress.failed
    if (completed === progress.total || completed - lastReported >= 25) {
      lastReported = completed
      console.error(
        `details ${completed}/${progress.total} cache=${progress.cacheHits} fetched=${progress.fetched} failed=${progress.failed}`,
      )
    }
  },
})

console.log(
  JSON.stringify(
    {
      discovery: {
        isComplete: discovery.isComplete,
        cards: discovery.cards.length,
        specialEntries: discovery.specialEntries.length,
        requestCount: discovery.requestCount,
        retryCount: discovery.retryCount,
      },
      details: {
        total: report.total,
        succeeded: report.succeeded,
        fetched: report.fetched,
        cacheHits: report.cacheHits,
        failed: report.failed,
        aborted: report.aborted,
        requestCount: report.requestCount,
        retryCount: report.retryCount,
        issues: report.issues,
      },
      cacheDirectory,
    },
    null,
    2,
  ),
)

if (!discovery.isComplete || report.failed > 0 || report.aborted) {
  process.exitCode = 1
}
