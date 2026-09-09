import { Link } from 'react-router-dom'

import { DeckQuantityControl } from '../decks/DeckQuantityControl'
import type { Card } from '../../domain/cards/types'
import type { CardPaginationResult } from '../../domain/search/paginateCards'

export type DeckQuickEditControls = {
  disabled: boolean
  quantityFor: (cardNumber: string) => number
  onDecrement: (cardNumber: string) => void
  onIncrement: (cardNumber: string) => void
}

type CardSearchResultsProps = {
  result: CardPaginationResult
  onPrevious: () => void
  onNext: () => void
  onClear: () => void
  deckControls?: DeckQuickEditControls
}

function CardResult({
  card,
  deckControls,
}: {
  card: Card
  deckControls?: DeckQuickEditControls
}) {
  const quantity = deckControls?.quantityFor(card.cardNumber) ?? 0
  return (
    <article className="card-result">
      <div className="card-result__image-frame">
        {card.imageUrl ? (
          <img
            src={card.imageUrl}
            alt={`${card.name}のカード画像`}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="card-result__image-missing">画像なし</span>
        )}
      </div>
      <div className="card-result__body">
        <p className="card-result__number">{card.cardNumber}</p>
        <h2>
          <Link to={`/cards/${encodeURIComponent(card.cardNumber)}`}>
            {card.name}
          </Link>
        </h2>
        {deckControls && (
          <DeckQuantityControl
            cardName={card.name}
            quantity={quantity}
            disabled={deckControls.disabled}
            onDecrement={() => deckControls.onDecrement(card.cardNumber)}
            onIncrement={() => deckControls.onIncrement(card.cardNumber)}
          />
        )}
      </div>
    </article>
  )
}

export function CardSearchResults({
  result,
  onPrevious,
  onNext,
  onClear,
  deckControls,
}: CardSearchResultsProps) {
  return (
    <section className="search-results" aria-labelledby="search-result-count">
      <div className="search-results__header">
        <p id="search-result-count" aria-live="polite">
          <strong>{result.totalItems}件</strong>のカード
        </p>
        {result.totalPages > 0 && (
          <span>
            {result.page} / {result.totalPages}ページ
          </span>
        )}
      </div>

      {result.totalItems === 0 ? (
        <div className="empty-results">
          <p>条件に一致するカードがありません。</p>
          <button type="button" className="button" onClick={onClear}>
            条件をクリア
          </button>
        </div>
      ) : (
        <div className="card-grid">
          {result.items.map((card) => (
            <CardResult
              card={card}
              deckControls={deckControls}
              key={card.cardNumber}
            />
          ))}
        </div>
      )}

      {result.totalPages > 1 && (
        <nav className="pagination" aria-label="検索結果のページ">
          <button
            type="button"
            className="button button--secondary"
            disabled={!result.hasPreviousPage}
            onClick={onPrevious}
          >
            前へ
          </button>
          <span aria-current="page">
            {result.page} / {result.totalPages}
          </span>
          <button
            type="button"
            className="button button--secondary"
            disabled={!result.hasNextPage}
            onClick={onNext}
          >
            次へ
          </button>
        </nav>
      )}
    </section>
  )
}
