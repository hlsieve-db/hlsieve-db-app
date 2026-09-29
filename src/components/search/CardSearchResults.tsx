import { Link } from 'react-router-dom'

import { ProgressiveCardImage } from '../cards/ProgressiveCardImage'
import { DeckQuantityControl } from '../decks/DeckQuantityControl'
import { FavoriteToggleButton } from '../favorites/FavoriteToggleButton'
import {
  ABILITY_TYPE_LABELS,
  BLOOM_LEVEL_LABELS,
  CARD_COLOR_LABELS,
  CARD_TYPE_LABELS,
  CRITICAL_COLOR_LABELS,
  DEBUT_TYPE_LABELS,
  EFFECT_TAG_LABELS,
  SUPPORT_TYPE_LABELS,
} from '../../domain/cards/constants'
import type { Card, RequiredCheer } from '../../domain/cards/types'
import type { CardViewMode } from '../../domain/search/cardViewMode'
import type { CardPaginationResult } from '../../domain/search/paginateCards'
import type { CardDetailReturnState } from '../../domain/navigation/cardDetailReturnState'

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
  viewMode: CardViewMode
  deckControls?: DeckQuickEditControls
  detailState?: CardDetailReturnState
}

const VISIBLE_PRODUCT_COUNT = 3

function cheerLabel(cheer: RequiredCheer): string {
  const color = cheer.color === 'any' ? '任意' : CARD_COLOR_LABELS[cheer.color]
  return `${color} × ${cheer.count}`
}

function bloomLabel(card: Card): string | undefined {
  if (!card.bloomLevel) return undefined
  const level = BLOOM_LEVEL_LABELS[card.bloomLevel]
  if (card.bloomLevel !== 'debut' || !card.debutType) return level
  return `${level}（${DEBUT_TYPE_LABELS[card.debutType]}）`
}

function CardResult({
  card,
  deckControls,
  detailState,
}: {
  card: Card
  deckControls?: DeckQuickEditControls
  detailState?: CardDetailReturnState
}) {
  const quantity = deckControls?.quantityFor(card.cardNumber) ?? 0
  const detailPath = `/cards/${encodeURIComponent(card.cardNumber)}`
  return (
    <article className="card-result" data-card-number={card.cardNumber}>
      <Link
        className="card-result__image-link"
        to={detailPath}
        state={detailState}
        aria-label={`${card.name}の詳細を見る`}
      >
        <ProgressiveCardImage
          src={card.imageUrl}
          alt={`${card.name}のカード画像`}
          className="card-result__image-frame"
        />
      </Link>
      <div className="card-result__body">
        <p className="card-result__number">{card.cardNumber}</p>
        <h2>
          <Link to={detailPath} state={detailState}>
            {card.name}
          </Link>
        </h2>
        <FavoriteToggleButton
          cardName={card.name}
          cardNumber={card.cardNumber}
        />
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

function TextCardResult({
  card,
  deckControls,
  detailState,
}: {
  card: Card
  deckControls?: DeckQuickEditControls
  detailState?: CardDetailReturnState
}) {
  const quantity = deckControls?.quantityFor(card.cardNumber) ?? 0
  const detailPath = `/cards/${encodeURIComponent(card.cardNumber)}`
  const remainingProducts = card.products.slice(VISIBLE_PRODUCT_COUNT)

  return (
    <article className="text-card-result" data-card-number={card.cardNumber}>
      <header className="text-card-result__header">
        <div>
          <p className="card-result__number">{card.cardNumber}</p>
          <h2>
            <Link to={detailPath} state={detailState}>
              {card.name}
            </Link>
          </h2>
        </div>
        <span className="text-card-result__type">
          {CARD_TYPE_LABELS[card.cardType]}
        </span>
      </header>

      <dl className="text-card-result__facts">
        {card.colors.length > 0 && (
          <div>
            <dt>色</dt>
            <dd>
              {card.colors.map((color) => CARD_COLOR_LABELS[color]).join('・')}
            </dd>
          </div>
        )}
        {bloomLabel(card) && (
          <div>
            <dt>Bloom</dt>
            <dd>{bloomLabel(card)}</dd>
          </div>
        )}
        {card.supportType && (
          <div>
            <dt>Support分類</dt>
            <dd>{SUPPORT_TYPE_LABELS[card.supportType]}</dd>
          </div>
        )}
        {card.hp !== undefined && (
          <div>
            <dt>HP</dt>
            <dd>{card.hp}</dd>
          </div>
        )}
        {card.life !== undefined && (
          <div>
            <dt>ライフ</dt>
            <dd>{card.life}</dd>
          </div>
        )}
        {card.rarities.length > 0 && (
          <div>
            <dt>レアリティ</dt>
            <dd>{card.rarities.join('・')}</dd>
          </div>
        )}
      </dl>

      {card.abilities.length > 0 && (
        <section className="text-card-result__section">
          <h3>能力</h3>
          <div className="text-card-result__stack">
            {card.abilities.map((ability, index) => (
              <div className="text-card-result__text" key={index}>
                <h4>
                  {ability.type ? ABILITY_TYPE_LABELS[ability.type] : '能力'}
                </h4>
                <p>{ability.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {card.arts.length > 0 && (
        <section className="text-card-result__section">
          <h3>アーツ</h3>
          <div className="text-card-result__stack">
            {card.arts.map((art, index) => (
              <div
                className="text-card-result__text"
                key={`${art.name}-${index}`}
              >
                <h4>{art.name}</h4>
                <dl className="text-card-result__art-facts">
                  {art.requiredCheers.length > 0 && (
                    <div>
                      <dt>必要エール</dt>
                      <dd>{art.requiredCheers.map(cheerLabel).join('、')}</dd>
                    </div>
                  )}
                  {art.damage !== undefined && (
                    <div>
                      <dt>ダメージ</dt>
                      <dd>{art.damage}</dd>
                    </div>
                  )}
                  {art.critical && (
                    <div>
                      <dt>Critical</dt>
                      <dd>
                        {CRITICAL_COLOR_LABELS[art.critical.color]}
                        {art.critical.bonusDamage !== undefined &&
                          ` +${art.critical.bonusDamage}`}
                      </dd>
                    </div>
                  )}
                </dl>
                {art.effectText && <p>{art.effectText}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {(card.extraText ||
        card.batonPass.length > 0 ||
        card.effectTags.length > 0 ||
        card.deckLimit != null ||
        (card.cardType === 'support' && card.isLimited !== undefined) ||
        card.products.length > 0) && (
        <section className="text-card-result__section text-card-result__supporting">
          <h3>補助情報</h3>
          {card.extraText && <p>{card.extraText}</p>}
          <dl className="text-card-result__supporting-facts">
            {card.batonPass.length > 0 && (
              <div>
                <dt>バトンタッチ</dt>
                <dd>{card.batonPass.map(cheerLabel).join('、')}</dd>
              </div>
            )}
            {card.effectTags.length > 0 && (
              <div>
                <dt>効果タグ</dt>
                <dd>
                  {card.effectTags
                    .map((tag) => EFFECT_TAG_LABELS[tag])
                    .join('・')}
                </dd>
              </div>
            )}
            {card.deckLimit != null && (
              <div>
                <dt>デッキ上限</dt>
                <dd>{card.deckLimit}枚</dd>
              </div>
            )}
            {card.cardType === 'support' && card.isLimited !== undefined && (
              <div>
                <dt>LIMITED</dt>
                <dd>{card.isLimited ? '対象' : '対象外'}</dd>
              </div>
            )}
            {card.products.length > 0 && (
              <div className="text-card-result__products">
                <dt>収録商品</dt>
                <dd>
                  <ul>
                    {card.products
                      .slice(0, VISIBLE_PRODUCT_COUNT)
                      .map((product) => (
                        <li key={product}>{product}</li>
                      ))}
                  </ul>
                  {remainingProducts.length > 0 && (
                    <details>
                      <summary>その他{remainingProducts.length}件</summary>
                      <ul>
                        {remainingProducts.map((product) => (
                          <li key={product}>{product}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}

      <div className="text-card-result__actions">
        <FavoriteToggleButton
          cardName={card.name}
          cardNumber={card.cardNumber}
        />
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
  viewMode,
  deckControls,
  detailState,
}: CardSearchResultsProps) {
  return (
    <section
      className={`search-results search-results--${viewMode}`}
      aria-labelledby="search-result-count"
    >
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
        <div className={viewMode === 'text' ? 'text-card-list' : 'card-grid'}>
          {result.items.map((card) =>
            viewMode === 'text' ? (
              <TextCardResult
                card={card}
                deckControls={deckControls}
                detailState={detailState}
                key={card.cardNumber}
              />
            ) : (
              <CardResult
                card={card}
                deckControls={deckControls}
                detailState={detailState}
                key={card.cardNumber}
              />
            ),
          )}
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
