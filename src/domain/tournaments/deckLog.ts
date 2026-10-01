export const DECK_LOG_PUBLIC_VIEW_BASE_URL =
  'https://decklog.bushiroad.com/view/'

export function buildDeckLogPublicUrl(code: string): string {
  const normalized = code.trim()
  if (!normalized) throw new Error('Deck Log code must not be empty.')
  return `${DECK_LOG_PUBLIC_VIEW_BASE_URL}${encodeURIComponent(normalized)}`
}
