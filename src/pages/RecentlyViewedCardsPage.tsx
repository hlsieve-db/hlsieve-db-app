import { useEffect, useMemo, useState } from 'react'
import { useAppRepositories } from '../repositories/useAppRepositories'
import { Link } from 'react-router-dom'

import { AppNavigation } from '../components/AppNavigation'
import { CardsLocalNavigation } from '../components/CardsLocalNavigation'
import { CARD_COLOR_LABELS, CARD_TYPE_LABELS } from '../domain/cards/constants'
import type { CardsDataFile } from '../domain/cards/types'
import type { RecentlyViewedCard } from '../domain/recentlyViewed/types'
import { RECENTLY_VIEWED_METADATA } from '../domain/site/metadata'
import { useDocumentMetadata } from '../hooks/useDocumentMetadata'
import { loadCardsData } from '../repositories/loadCardsData'
import { type RecentlyViewedCardRepository } from '../repositories/recentlyViewedCardRepository'
import { formatViewedAt } from '../utils/formatViewedAt'

type PageState =
  | { status: 'loading' }
  | {
      status: 'loaded'
      records: RecentlyViewedCard[]
      cards: CardsDataFile
    }
  | { status: 'error' }

export function RecentlyViewedCardsPage({
  repository: repositoryProp,
  loadCards = loadCardsData,
}: {
  repository?: RecentlyViewedCardRepository
  loadCards?: () => Promise<CardsDataFile>
}) {
  const repositories = useAppRepositories()
  const repository = repositoryProp ?? repositories.recentlyViewedCards
  const [state, setState] = useState<PageState>({ status: 'loading' })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [mutationError, setMutationError] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  useDocumentMetadata(RECENTLY_VIEWED_METADATA)

  useEffect(() => {
    let active = true
    void Promise.all([repository.list(), loadCards()]).then(
      ([records, cards]) => {
        if (active) setState({ status: 'loaded', records, cards })
      },
      () => {
        if (active) setState({ status: 'error' })
      },
    )
    return () => {
      active = false
    }
  }, [loadAttempt, loadCards, repository])

  const cardsByNumber = useMemo(
    () =>
      new Map(
        state.status === 'loaded'
          ? state.cards.cards.map((card) => [card.cardNumber, card])
          : [],
      ),
    [state],
  )

  const remove = async (cardNumber: string) => {
    setMutationError('')
    try {
      await repository.remove(cardNumber)
      setState((current) =>
        current.status === 'loaded'
          ? {
              ...current,
              records: current.records.filter(
                (record) => record.cardNumber !== cardNumber,
              ),
            }
          : current,
      )
    } catch {
      setMutationError('最近見たカードから削除できませんでした。')
    }
  }

  const clear = async () => {
    setMutationError('')
    try {
      await repository.clear()
      setState((current) =>
        current.status === 'loaded' ? { ...current, records: [] } : current,
      )
      setConfirmClear(false)
    } catch {
      setMutationError('最近見たカードの履歴を削除できませんでした。')
    }
  }

  return (
    <main id="main-content" className="recent-page">
      <header className="recent-page__header">
        <AppNavigation />
        <CardsLocalNavigation />
        <h1>最近見たカード</h1>
        <p>最近見たカードはこのブラウザ内に保存されます。</p>
      </header>

      {mutationError && (
        <p className="status-message status-message--error" role="alert">
          {mutationError}
        </p>
      )}

      {state.status === 'loading' && (
        <p className="status-message" role="status">
          最近見たカードを読み込んでいます…
        </p>
      )}

      {state.status === 'error' && (
        <div className="status-message status-message--error" role="alert">
          <p>最近見たカードを読み込めませんでした。</p>
          <button
            type="button"
            className="button"
            onClick={() => {
              setState({ status: 'loading' })
              setLoadAttempt((attempt) => attempt + 1)
            }}
          >
            再試行
          </button>
        </div>
      )}

      {state.status === 'loaded' && state.records.length === 0 && (
        <section className="recent-empty">
          <p>最近見たカードはありません。</p>
          <Link className="button" to="/cards">
            カードを探す
          </Link>
        </section>
      )}

      {state.status === 'loaded' && state.records.length > 0 && (
        <section aria-label="最近見たカード一覧">
          <div className="recent-page__list-header">
            <p>{state.records.length}件</p>
            <button
              type="button"
              className="button button--danger"
              aria-label="最近見たカードの履歴をすべて削除"
              onClick={() => setConfirmClear(true)}
            >
              履歴をすべて削除
            </button>
          </div>
          <ul className="recent-card-list">
            {state.records.map((record) => {
              const card = cardsByNumber.get(record.cardNumber)
              const name = card?.name ?? record.cardNumber
              const detailPath = card
                ? `/cards/${encodeURIComponent(card.cardNumber)}`
                : undefined
              return (
                <li className="recent-card" key={record.cardNumber}>
                  {card?.imageUrl ? (
                    <Link
                      className="recent-card__image"
                      to={detailPath!}
                      aria-label={`${card.name}の詳細を見る`}
                    >
                      <img
                        src={card.imageUrl}
                        alt={`${card.name}のカード画像`}
                        loading="lazy"
                        decoding="async"
                      />
                    </Link>
                  ) : (
                    <div className="recent-card__image recent-card__image--missing">
                      画像なし
                    </div>
                  )}
                  <div className="recent-card__body">
                    <p className="recent-card__number">{record.cardNumber}</p>
                    <h2>
                      {detailPath ? (
                        <Link to={detailPath}>{card!.name}</Link>
                      ) : (
                        '現在のカード一覧では見つかりません'
                      )}
                    </h2>
                    {card && (
                      <p className="recent-card__facts">
                        {card.colors
                          .map((color) => CARD_COLOR_LABELS[color])
                          .join('・')}{' '}
                        / {CARD_TYPE_LABELS[card.cardType]}
                      </p>
                    )}
                    <p>
                      閲覧日時:{' '}
                      <time dateTime={record.viewedAt}>
                        {formatViewedAt(record.viewedAt)}
                      </time>
                    </p>
                    <button
                      type="button"
                      className="button button--secondary"
                      aria-label={`${name}を最近見たカードから削除`}
                      onClick={() => void remove(record.cardNumber)}
                    >
                      履歴から削除
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {confirmClear && (
        <div className="recent-dialog-backdrop">
          <div
            className="recent-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-recent-heading"
          >
            <h2 id="clear-recent-heading">最近見たカードの履歴を削除</h2>
            <p>最近見たカードの履歴をすべて削除しますか？</p>
            <div className="recent-dialog__actions">
              <button
                type="button"
                className="button button--danger"
                onClick={() => void clear()}
              >
                すべて削除
              </button>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setConfirmClear(false)}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
