import { discoverCardEntries } from './discoverCardEntries'
import { createHtmlFetcher } from './fetchHtml'

const OFFICIAL_FORM_URL = 'https://hololive-official-cardgame.com/cardlist/'

function pageReport(result: Awaited<ReturnType<typeof discoverCardEntries>>) {
  return Object.fromEntries(
    (['all', 'parallel_only', 'non_parallel'] as const).map((mode) => {
      const page = result.pages[mode]
      return [
        mode,
        page
          ? {
              declaredCount: page.declaredResultCount ?? null,
              initialRawParsedCount: page.rawEntryCount,
              unionParsedCount: page.parsedEntryCount,
              cardCount: page.cards.length,
              specialCount: page.specialEntries.length,
              partitionCount: page.partitionCount,
              pagination: page.pagination
                ? {
                    currentPage: page.pagination.currentPage,
                    maxPage: page.pagination.maxPage,
                    fetchedPageCount: page.pagination.fetchedPages.length,
                    fetchedPages: page.pagination.fetchedPages,
                    pageEntryCounts: page.pagination.pageEntryCounts,
                  }
                : null,
              isComplete: page.isComplete,
            }
          : null,
      ]
    }),
  )
}

const fetchHtml = createHtmlFetcher({ minIntervalMs: 750 })
const result = await discoverCardEntries({
  formUrl: OFFICIAL_FORM_URL,
  fetchHtml,
  stats: fetchHtml.stats,
})

const form = result.formDefinition
const groups = new Map<string, typeof result.cards>()
for (const card of result.cards) {
  const group = groups.get(card.cardNumber) ?? []
  group.push(card)
  groups.set(card.cardNumber, group)
}
const normalParallelExamples = [...groups.entries()]
  .filter(
    ([, cards]) =>
      cards.some((card) => card.isParallel) &&
      cards.some((card) => !card.isParallel),
  )
  .slice(0, 5)
  .map(([cardNumber, cards]) => ({
    cardNumber,
    officialIds: cards.map((card) => ({
      officialId: card.officialId,
      isParallel: card.isParallel,
    })),
  }))
const cardNumberClassification = [...groups.values()].reduce(
  (counts, cards) => {
    const hasParallel = cards.some((card) => card.isParallel)
    const hasNormal = cards.some((card) => !card.isParallel)
    if (hasParallel && hasNormal) counts.normalAndParallel += 1
    else if (hasParallel) counts.parallelOnly += 1
    else counts.normalOnly += 1
    return counts
  },
  { normalAndParallel: 0, normalOnly: 0, parallelOnly: 0 },
)
const issueCounts = Object.fromEntries(
  [...new Set(result.issues.map((issue) => issue.code))]
    .sort()
    .map((code) => [
      code,
      result.issues.filter((issue) => issue.code === code).length,
    ]),
)

const report = {
  officialFormUrl: OFFICIAL_FORM_URL,
  form: form
    ? {
        action: form.action,
        method: form.method,
        parallelParameterName: form.parallelFilter.parameterName,
        allValue: form.parallelFilter.allValue,
        parallelOnlyValue: form.parallelFilter.parallelOnlyValue,
        nonParallelValue: form.parallelFilter.nonParallelValue,
        productParameterName: form.productFilter?.parameterName ?? null,
        productOptionCount: form.productFilter?.options.length ?? 0,
        textViewParameterName: form.textView?.parameterName ?? null,
        textViewValue: form.textView?.value ?? null,
      }
    : null,
  pages: pageReport(result),
  final: {
    ...result.counts,
    isComplete: result.isComplete,
    requestCount: result.requestCount,
    retryCount: result.retryCount,
    cardNumberClassification,
    normalParallelExamples,
    specialExamples: result.specialEntries.slice(0, 5),
    issueCounts,
    issueSamples: result.issues.slice(0, 20),
  },
}

console.log(JSON.stringify(report, null, 2))
if (!result.isComplete) process.exitCode = 1
