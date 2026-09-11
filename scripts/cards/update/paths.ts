import { resolve } from 'node:path'

export const UPDATE_PATHS = {
  baselineCards: resolve('public/cards.json'),
  baselinePrintings: resolve('public/card-printings.json'),
  publicSitemap: resolve('public/sitemap.xml'),
  publicRobots: resolve('public/robots.txt'),
  candidateDirectory: resolve('.cache/cards/update'),
  candidateCards: resolve('.cache/cards/update/cards.json'),
  candidatePrintings: resolve('.cache/cards/update/card-printings.json'),
  candidateSitemap: resolve('.cache/cards/update/sitemap.xml'),
  candidateRobots: resolve('.cache/cards/update/robots.txt'),
  candidateMetadata: resolve('.cache/cards/update/prepare.json'),
  detailsCache: resolve('.cache/cards/details'),
  reportJson: resolve('.cache/reports/card-update.json'),
  reportMarkdown: resolve('.cache/reports/card-update.md'),
  historyCandidate: resolve('.cache/reports/card-update-entry.candidate.json'),
} as const
