export type FavoriteCard = {
  cardNumber: string
  createdAt: string
}

export function isFavoriteCard(value: unknown): value is FavoriteCard {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<FavoriteCard>
  return (
    typeof candidate.cardNumber === 'string' &&
    candidate.cardNumber.trim().length > 0 &&
    typeof candidate.createdAt === 'string' &&
    !Number.isNaN(Date.parse(candidate.createdAt))
  )
}
