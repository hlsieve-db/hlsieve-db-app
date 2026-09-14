export const RECENTLY_VIEWED_LIMIT = 50

export type RecentlyViewedCard = {
  cardNumber: string
  viewedAt: string
}

export function isRecentlyViewedCard(
  value: unknown,
): value is RecentlyViewedCard {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<RecentlyViewedCard>
  return (
    typeof candidate.cardNumber === 'string' &&
    candidate.cardNumber.trim() === candidate.cardNumber &&
    candidate.cardNumber.length > 0 &&
    typeof candidate.viewedAt === 'string' &&
    !Number.isNaN(Date.parse(candidate.viewedAt))
  )
}
