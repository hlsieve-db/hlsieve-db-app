import type { CardDataUpdateEntry } from './types'

// Add only reviewed, actually published updates. Do not infer historical entries.
export const CARD_DATA_UPDATE_HISTORY: readonly CardDataUpdateEntry[] = []

export function formatUpdateDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[1]}/${match[2]}/${match[3]}` : value
}

export function latestFirst(
  entries: readonly CardDataUpdateEntry[],
): CardDataUpdateEntry[] {
  return [...entries].sort((left, right) => {
    const byDate = right.publishedAt.localeCompare(left.publishedAt, 'en')
    return byDate || right.id.localeCompare(left.id, 'en')
  })
}
