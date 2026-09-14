import { useFavoriteCards } from '../../contexts/favoriteCardsContextValue'

export function FavoriteToggleButton({
  cardName,
  cardNumber,
}: {
  cardName: string
  cardNumber: string
}) {
  const favorites = useFavoriteCards()
  const selected = favorites.isFavorite(cardNumber)
  const pending = favorites.pendingCardNumbers.has(cardNumber)
  const isReady = favorites.status === 'loaded'
  const accessibleName = !isReady
    ? `${cardName}のお気に入り状態を${favorites.status === 'loading' ? '確認中' : '確認できません'}`
    : selected
      ? `${cardName}をお気に入りから削除`
      : `${cardName}をお気に入りに追加`
  return (
    <button
      type="button"
      className="favorite-toggle"
      aria-label={accessibleName}
      aria-pressed={isReady ? selected : undefined}
      disabled={!isReady || pending}
      onClick={() => void favorites.toggleFavorite(cardNumber)}
    >
      <span aria-hidden="true">{isReady ? (selected ? '★' : '☆') : '…'}</span>
      <span>
        {isReady
          ? selected
            ? 'お気に入り済み'
            : 'お気に入り'
          : favorites.status === 'loading'
            ? '確認中'
            : '利用できません'}
      </span>
    </button>
  )
}
