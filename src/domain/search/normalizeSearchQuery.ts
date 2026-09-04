import { normalizeSearchText } from './normalizeSearchText'

export function normalizeSearchQuery(input: string): string {
  return normalizeSearchText(input)
}
