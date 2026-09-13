export type QaSearchUrlState = {
  query: string
  page: number
}

export const DEFAULT_QA_SEARCH_URL_STATE: QaSearchUrlState = {
  query: '',
  page: 1,
}

function cleanQuery(value: string | null): string {
  return value?.trim().replace(/\s+/g, ' ') ?? ''
}

export function parseQaSearchUrlState(
  input: string | URLSearchParams,
): QaSearchUrlState {
  const params =
    typeof input === 'string'
      ? new URLSearchParams(input.startsWith('?') ? input.slice(1) : input)
      : input
  const query = cleanQuery(params.get('q'))
  const pageValue = Number(params.get('page'))
  const page =
    query && Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1
  return { query, page }
}

export function serializeQaSearchUrlState({
  query,
  page,
}: QaSearchUrlState): URLSearchParams {
  const params = new URLSearchParams()
  const cleanedQuery = cleanQuery(query)
  if (!cleanedQuery) return params
  params.set('q', cleanedQuery)
  if (Number.isSafeInteger(page) && page > 1) params.set('page', String(page))
  return params
}
