import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'

import { AppNavigation } from '../components/AppNavigation'
import { CARD_TYPE_LABELS } from '../domain/cards/constants'
import type { Card, CardsDataFile } from '../domain/cards/types'
import {
  addCardToDeck,
  decrementCardQuantity,
  getDeckTotal,
  incrementCardQuantity,
  removeCardFromDeck,
  renameDeck,
} from '../domain/decks/deck'
import type { Deck } from '../domain/decks/types'
import { searchCards } from '../domain/search/searchCards'
import {
  deckRepository,
  type DeckRepository,
} from '../repositories/deckRepository'
import { loadCardsData } from '../repositories/loadCardsData'

type DeckLoadState =
  | { status: 'loading' }
  | { status: 'loaded'; deck: Deck }
  | { status: 'not-found' }
  | { status: 'error' }

type CardLoadState =
  | { status: 'loading' }
  | { status: 'loaded'; data: CardsDataFile }
  | { status: 'error' }

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

type DeckEditPageProps = {
  repository?: DeckRepository
  loadCards?: () => Promise<CardsDataFile>
}

function DeckCardImage({ card }: { card?: Card }) {
  return (
    <div className="deck-card-image">
      {card?.imageUrl ? (
        <img src={card.imageUrl} alt="" loading="lazy" decoding="async" />
      ) : (
        <span>画像なし</span>
      )}
    </div>
  )
}

function DeckEditor({
  initialDeck,
  repository,
  loadCards,
}: {
  initialDeck: Deck
  repository: DeckRepository
  loadCards: () => Promise<CardsDataFile>
}) {
  const [deck, setDeck] = useState(initialDeck)
  const [nameDraft, setNameDraft] = useState(initialDeck.name)
  const [nameError, setNameError] = useState<string>()
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [cardsState, setCardsState] = useState<CardLoadState>({
    status: 'loading',
  })
  const [cardsLoadAttempt, setCardsLoadAttempt] = useState(0)
  const [query, setQuery] = useState('')
  const deckRef = useRef(initialDeck)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const saveVersion = useRef(0)

  useEffect(() => {
    document.title = `${deck.name} | HLSieve DB`
  }, [deck.name])

  useEffect(() => {
    let active = true
    void loadCards().then(
      (data) => {
        if (active) setCardsState({ status: 'loaded', data })
      },
      () => {
        if (active) setCardsState({ status: 'error' })
      },
    )
    return () => {
      active = false
    }
  }, [cardsLoadAttempt, loadCards])

  const cardsByNumber = useMemo(
    () =>
      new Map(
        cardsState.status === 'loaded'
          ? cardsState.data.cards.map((card) => [card.cardNumber, card])
          : [],
      ),
    [cardsState],
  )

  const results = useMemo(
    () =>
      cardsState.status === 'loaded' && query.trim()
        ? searchCards(cardsState.data.cards, { query }).slice(0, 20)
        : [],
    [cardsState, query],
  )

  const persist = (nextDeck: Deck) => {
    const version = ++saveVersion.current
    setSaveState('saving')
    const request = saveQueue.current
      .catch(() => undefined)
      .then(() => repository.saveDeck(nextDeck))
    saveQueue.current = request
    void request.then(
      () => {
        if (saveVersion.current === version) setSaveState('saved')
      },
      () => {
        if (saveVersion.current === version) setSaveState('error')
      },
    )
  }

  const applyDeckChange = (update: (current: Deck) => Deck) => {
    const next = update(deckRef.current)
    deckRef.current = next
    setDeck(next)
    persist(next)
  }

  const submitRename = (event: FormEvent) => {
    event.preventDefault()
    try {
      const next = renameDeck(deckRef.current, nameDraft)
      deckRef.current = next
      setNameDraft(next.name)
      setNameError(undefined)
      setDeck(next)
      persist(next)
    } catch {
      setNameError('デッキ名を入力してください。')
    }
  }

  const retryCards = () => {
    setCardsState({ status: 'loading' })
    setCardsLoadAttempt((attempt) => attempt + 1)
  }

  return (
    <>
      <section
        className="deck-editor__summary"
        aria-labelledby="deck-name-heading"
      >
        <h1 id="deck-name-heading">{deck.name}</h1>
        <p className="deck-total" aria-live="polite">
          合計 {getDeckTotal(deck)}枚
        </p>
        <form className="deck-rename" onSubmit={submitRename}>
          <label htmlFor="deck-name">デッキ名</label>
          <div>
            <input
              id="deck-name"
              value={nameDraft}
              maxLength={100}
              onChange={(event) => setNameDraft(event.currentTarget.value)}
            />
            <button type="submit" className="button">
              名前を保存
            </button>
          </div>
        </form>
        {nameError && <p role="alert">{nameError}</p>}
        <p
          className={`save-state save-state--${saveState}`}
          role="status"
          aria-live="polite"
        >
          {saveState === 'saving' && '保存中…'}
          {saveState === 'saved' && '保存しました'}
          {saveState === 'error' &&
            'デッキを保存できませんでした。もう一度操作すると再試行します。'}
        </p>
      </section>

      <div className="deck-editor__columns">
        <section className="deck-panel" aria-labelledby="deck-entries-heading">
          <h2 id="deck-entries-heading">現在のカード</h2>
          {deck.entries.length === 0 ? (
            <p>カードが追加されていません。</p>
          ) : (
            <ul className="deck-entry-list">
              {deck.entries.map((entry) => {
                const card = cardsByNumber.get(entry.cardNumber)
                const displayName = card?.name ?? entry.cardNumber
                return (
                  <li className="deck-entry" key={entry.cardNumber}>
                    <DeckCardImage card={card} />
                    <div className="deck-entry__information">
                      <h3>{displayName}</h3>
                      <p>{entry.cardNumber}</p>
                      {cardsState.status === 'loaded' && !card && (
                        <p className="deck-entry__warning" role="alert">
                          カードデータに存在しないカードです
                        </p>
                      )}
                    </div>
                    <div
                      className="quantity-control"
                      aria-label={`${displayName}の枚数`}
                    >
                      <button
                        type="button"
                        aria-label={`${displayName}を1枚減らす`}
                        onClick={() =>
                          applyDeckChange((current) =>
                            decrementCardQuantity(current, entry.cardNumber),
                          )
                        }
                      >
                        −
                      </button>
                      <output aria-label={`${displayName}の現在枚数`}>
                        {entry.quantity}
                      </output>
                      <button
                        type="button"
                        aria-label={`${displayName}を1枚増やす`}
                        onClick={() =>
                          applyDeckChange((current) =>
                            incrementCardQuantity(current, entry.cardNumber),
                          )
                        }
                      >
                        ＋
                      </button>
                    </div>
                    <button
                      type="button"
                      className="button button--secondary deck-entry__remove"
                      aria-label={`${displayName}をデッキから削除`}
                      onClick={() =>
                        applyDeckChange((current) =>
                          removeCardFromDeck(current, entry.cardNumber),
                        )
                      }
                    >
                      削除
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="deck-panel" aria-labelledby="add-card-heading">
          <h2 id="add-card-heading">カードを追加</h2>
          <label className="search-field" htmlFor="deck-card-search">
            <span>カード検索</span>
            <input
              id="deck-card-search"
              type="search"
              value={query}
              placeholder="カード名・能力・Q&Aを検索…"
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </label>

          {cardsState.status === 'loading' && (
            <p role="status" aria-live="polite">
              カードデータを読み込んでいます…
            </p>
          )}
          {cardsState.status === 'error' && (
            <div role="alert">
              <p>カードデータを読み込めませんでした。</p>
              <button type="button" className="button" onClick={retryCards}>
                再試行
              </button>
            </div>
          )}
          {cardsState.status === 'loaded' &&
            query.trim() &&
            results.length === 0 && <p>条件に一致するカードがありません。</p>}
          {results.length > 0 && (
            <ul className="deck-search-results">
              {results.map((card) => (
                <li key={card.cardNumber}>
                  <DeckCardImage card={card} />
                  <div>
                    <h3>{card.name}</h3>
                    <p>
                      {card.cardNumber}・{CARD_TYPE_LABELS[card.cardType]}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button"
                    aria-label={`${card.name}をデッキに追加`}
                    onClick={() =>
                      applyDeckChange((current) =>
                        addCardToDeck(current, card.cardNumber),
                      )
                    }
                  >
                    追加
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}

export function DeckEditPage({
  repository = deckRepository,
  loadCards = loadCardsData,
}: DeckEditPageProps) {
  const { deckId } = useParams<'deckId'>()
  const [state, setState] = useState<DeckLoadState>({ status: 'loading' })
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    let active = true
    if (!deckId) return
    void repository.getDeck(deckId).then(
      (deck) => {
        if (!active) return
        setState(deck ? { status: 'loaded', deck } : { status: 'not-found' })
      },
      () => {
        if (active) setState({ status: 'error' })
      },
    )
    return () => {
      active = false
    }
  }, [deckId, loadAttempt, repository])

  useEffect(() => {
    const previousTitle = document.title
    document.title =
      state.status === 'loaded'
        ? `${state.deck.name} | HLSieve DB`
        : 'デッキ編集 | HLSieve DB'
    return () => {
      document.title = previousTitle
    }
  }, [state])

  const retryLoad = () => {
    setState({ status: 'loading' })
    setLoadAttempt((attempt) => attempt + 1)
  }

  return (
    <main className="deck-page deck-editor">
      <header className="deck-page__header">
        <AppNavigation />
        <Link className="back-link" to="/decks">
          保存デッキへ戻る
        </Link>
      </header>

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
      {state.status === 'not-found' && (
        <section className="status-message">
          <h1>デッキが見つかりません</h1>
          <Link className="button detail-link-button" to="/decks">
            保存デッキへ戻る
          </Link>
        </section>
      )}
      {state.status === 'loaded' && (
        <DeckEditor
          key={state.deck.id}
          initialDeck={state.deck}
          repository={repository}
          loadCards={loadCards}
        />
      )}
    </main>
  )
}
