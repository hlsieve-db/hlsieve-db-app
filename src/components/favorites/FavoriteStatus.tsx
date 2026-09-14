import { useFavoriteCards } from '../../contexts/favoriteCardsContextValue'

export function FavoriteStatus() {
  const favorites = useFavoriteCards()
  if (favorites.status === 'loading') {
    return (
      <p className="favorite-status" role="status">
        お気に入りを読み込んでいます…
      </p>
    )
  }
  if (favorites.status === 'error') {
    return (
      <div className="favorite-status favorite-status--error" role="alert">
        <span>お気に入りを読み込めませんでした。</span>
        <button
          type="button"
          className="button button--secondary"
          onClick={favorites.retry}
        >
          再試行
        </button>
      </div>
    )
  }
  if (favorites.mutationError) {
    return (
      <p className="favorite-status favorite-status--error" role="alert">
        お気に入りを保存できませんでした。
      </p>
    )
  }
  return favorites.announcement ? (
    <p className="favorite-status" role="status" aria-live="polite">
      {favorites.announcement}
    </p>
  ) : null
}
