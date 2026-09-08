import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { AppNavigation } from '../components/AppNavigation'
import { createDeck, getDeckTotal } from '../domain/decks/deck'
import type { Deck } from '../domain/decks/types'
import {
  deckRepository,
  type DeckRepository,
} from '../repositories/deckRepository'

type DeckListState =
  | { status: 'loading' }
  | { status: 'loaded'; decks: Deck[] }
  | { status: 'error' }

type SavedDecksPageProps = {
  repository?: DeckRepository
  createNewDeck?: () => Deck
}

export function SavedDecksPage({
  repository = deckRepository,
  createNewDeck = createDeck,
}: SavedDecksPageProps) {
  const navigate = useNavigate()
  const [state, setState] = useState<DeckListState>({ status: 'loading' })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [pendingDeleteId, setPendingDeleteId] = useState<string>()
  const [operationError, setOperationError] = useState<string>()
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let active = true
    void repository.listDecks().then(
      (decks) => {
        if (active) setState({ status: 'loaded', decks })
      },
      () => {
        if (active) setState({ status: 'error' })
      },
    )
    return () => {
      active = false
    }
  }, [loadAttempt, repository])

  useEffect(() => {
    const previousTitle = document.title
    document.title = '保存デッキ | HLSieve DB'
    return () => {
      document.title = previousTitle
    }
  }, [])

  const retryLoad = () => {
    setState({ status: 'loading' })
    setLoadAttempt((attempt) => attempt + 1)
  }

  const handleCreate = async () => {
    setCreating(true)
    setOperationError(undefined)
    try {
      const deck = createNewDeck()
      await repository.saveDeck(deck)
      navigate(`/decks/${encodeURIComponent(deck.id)}`)
    } catch {
      setOperationError('デッキを作成できませんでした。')
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    setOperationError(undefined)
    try {
      await repository.deleteDeck(id)
      setState((current) =>
        current.status === 'loaded'
          ? {
              status: 'loaded',
              decks: current.decks.filter((deck) => deck.id !== id),
            }
          : current,
      )
      setPendingDeleteId(undefined)
    } catch {
      setOperationError('デッキを削除できませんでした。')
    }
  }

  return (
    <main className="deck-page">
      <header className="deck-page__header">
        <AppNavigation />
        <h1>保存デッキ</h1>
        <p>端末に保存したデッキを管理します。</p>
      </header>

      <div className="deck-page__actions">
        <button
          type="button"
          className="button"
          disabled={creating}
          onClick={() => void handleCreate()}
        >
          {creating ? '作成中…' : '新しいデッキを作成'}
        </button>
      </div>

      {operationError && (
        <p className="status-message status-message--error" role="alert">
          {operationError}
        </p>
      )}

      {state.status === 'loading' && (
        <p className="status-message" role="status" aria-live="polite">
          デッキを読み込んでいます…
        </p>
      )}

      {state.status === 'error' && (
        <div className="status-message status-message--error" role="alert">
          <p>デッキを読み込めませんでした。</p>
          <button type="button" className="button" onClick={retryLoad}>
            再試行
          </button>
        </div>
      )}

      {state.status === 'loaded' && state.decks.length === 0 && (
        <p className="status-message">デッキがありません</p>
      )}

      {state.status === 'loaded' && state.decks.length > 0 && (
        <section aria-label="保存したデッキ">
          <ul className="deck-list">
            {state.decks.map((deck) => (
              <li className="deck-list__item" key={deck.id}>
                <div>
                  <h2>{deck.name}</h2>
                  <p>合計 {getDeckTotal(deck)}枚</p>
                  <p>
                    <time dateTime={deck.updatedAt}>
                      更新 {new Date(deck.updatedAt).toLocaleString('ja-JP')}
                    </time>
                  </p>
                </div>
                <div className="deck-list__actions">
                  <Link
                    className="button detail-link-button"
                    to={`/decks/${encodeURIComponent(deck.id)}`}
                  >
                    開く
                  </Link>
                  <button
                    type="button"
                    className="button button--danger"
                    aria-label={`${deck.name}を削除`}
                    onClick={() => setPendingDeleteId(deck.id)}
                  >
                    削除
                  </button>
                </div>
                {pendingDeleteId === deck.id && (
                  <div
                    className="delete-confirmation"
                    role="alertdialog"
                    aria-label="デッキ削除の確認"
                  >
                    <p>「{deck.name}」を削除しますか？</p>
                    <div>
                      <button
                        type="button"
                        className="button button--danger"
                        onClick={() => void handleDelete(deck.id)}
                      >
                        削除する
                      </button>
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => setPendingDeleteId(undefined)}
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
