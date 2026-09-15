import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { AppNavigation } from '../components/AppNavigation'
import { CardsLocalNavigation } from '../components/CardsLocalNavigation'
import { FavoriteStatus } from '../components/favorites/FavoriteStatus'
import { FavoriteToggleButton } from '../components/favorites/FavoriteToggleButton'
import { CARD_COLOR_LABELS, CARD_TYPE_LABELS } from '../domain/cards/constants'
import type { CardsDataFile } from '../domain/cards/types'
import { useFavoriteCards } from '../contexts/favoriteCardsContextValue'
import { FAVORITES_METADATA } from '../domain/site/metadata'
import { useDocumentMetadata } from '../hooks/useDocumentMetadata'
import { loadCardsData } from '../repositories/loadCardsData'

type CardDataState =
  | { status: 'loading' }
  | { status: 'loaded'; data: CardsDataFile }
  | { status: 'error' }

export function FavoriteCardsPage({
  loadCards = loadCardsData,
}: {
  loadCards?: () => Promise<CardsDataFile>
}) {
  const favorites = useFavoriteCards()
  const [cardData, setCardData] = useState<CardDataState>({ status: 'loading' })
  const [loadAttempt, setLoadAttempt] = useState(0)

  useDocumentMetadata(FAVORITES_METADATA)

  useEffect(() => {
    let active = true
    void loadCards().then(
      (data) => {
        if (active) setCardData({ status: 'loaded', data })
      },
      () => {
        if (active) setCardData({ status: 'error' })
      },
    )
    return () => {
      active = false
    }
  }, [loadAttempt, loadCards])

  const cardsByNumber = useMemo(
    () =>
      new Map(
        cardData.status === 'loaded'
          ? cardData.data.cards.map((card) => [card.cardNumber, card])
          : [],
      ),
    [cardData],
  )

  return (
    <main id="main-content" className="favorites-page">
      <header className="favorites-page__header">
        <AppNavigation />
        <CardsLocalNavigation />
        <h1>お気に入りカード</h1>
        <p>お気に入りはこのブラウザ内に保存されます。</p>
      </header>

      <FavoriteStatus />

      {cardData.status === 'loading' && (
        <p className="status-message" role="status">
          カードデータを読み込んでいます…
        </p>
      )}
      {cardData.status === 'error' && (
        <div className="status-message status-message--error" role="alert">
          <p>カードデータを読み込めませんでした。</p>
          <button
            type="button"
            className="button"
            onClick={() => {
              setCardData({ status: 'loading' })
              setLoadAttempt((attempt) => attempt + 1)
            }}
          >
            再試行
          </button>
        </div>
      )}

      {favorites.status === 'loaded' &&
        cardData.status === 'loaded' &&
        favorites.favorites.length === 0 && (
          <section className="favorites-empty">
            <p>お気に入りカードはありません。</p>
            <Link className="button" to="/cards">
              カードを探す
            </Link>
          </section>
        )}

      {favorites.status === 'loaded' &&
        cardData.status === 'loaded' &&
        favorites.favorites.length > 0 && (
          <section aria-label="お気に入りカード一覧">
            <p className="favorites-count">{favorites.favorites.length}件</p>
            <div className="card-grid">
              {favorites.favorites.map((favorite) => {
                const card = cardsByNumber.get(favorite.cardNumber)
                if (!card) {
                  return (
                    <article
                      className="card-result favorite-card--unknown"
                      key={favorite.cardNumber}
                    >
                      <div className="card-result__body">
                        <p className="card-result__number">
                          {favorite.cardNumber}
                        </p>
                        <h2>現在のカード一覧では見つかりません</h2>
                        <p>保存済みのお気に入り記録です。</p>
                        <FavoriteToggleButton
                          cardName={favorite.cardNumber}
                          cardNumber={favorite.cardNumber}
                        />
                      </div>
                    </article>
                  )
                }
                const detailPath = `/cards/${encodeURIComponent(card.cardNumber)}`
                return (
                  <article className="card-result" key={card.cardNumber}>
                    <Link
                      className="card-result__image-link"
                      to={detailPath}
                      aria-label={`${card.name}の詳細を見る`}
                    >
                      <div className="card-result__image-frame">
                        {card.imageUrl ? (
                          <img
                            src={card.imageUrl}
                            alt={`${card.name}のカード画像`}
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <span className="card-result__image-missing">
                            画像なし
                          </span>
                        )}
                      </div>
                    </Link>
                    <div className="card-result__body">
                      <p className="card-result__number">{card.cardNumber}</p>
                      <h2>
                        <Link to={detailPath}>{card.name}</Link>
                      </h2>
                      <p className="favorite-card__facts">
                        {card.colors
                          .map((color) => CARD_COLOR_LABELS[color])
                          .join('・')}{' '}
                        / {CARD_TYPE_LABELS[card.cardType]}
                      </p>
                      <FavoriteToggleButton
                        cardName={card.name}
                        cardNumber={card.cardNumber}
                      />
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )}
    </main>
  )
}
