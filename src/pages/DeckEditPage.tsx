import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'

import { AppNavigation } from '../components/AppNavigation'
import { DeckLegalitySummary } from '../components/decks/DeckLegalitySummary'
import { DeckQuantityControl } from '../components/decks/DeckQuantityControl'
import { DECK_ZONE_LABELS } from '../components/decks/constants'
import { CardSearchFilters } from '../components/search/CardSearchFilters'
import { CARD_TYPE_LABELS } from '../domain/cards/constants'
import type { Card, CardsDataFile } from '../domain/cards/types'
import { DECK_NAME_MAX_LENGTH } from '../domain/decks/constants'
import {
  addCardToDeck,
  decrementCardQuantity,
  getDeckTotal,
  incrementCardQuantity,
  removeCardFromDeck,
  renameDeck,
} from '../domain/decks/deck'
import { getDeckZone, validateDeckLegality } from '../domain/decks/legality'
import type { Deck, DeckEntry } from '../domain/decks/types'
import { DEFAULT_CARD_PAGE_SIZE } from '../domain/search/constants'
import { getCardSearchResults } from '../domain/search/getCardSearchResults'
import {
  DEFAULT_SEARCH_URL_STATE,
  type SearchUrlState,
} from '../domain/search/searchUrlState'
import { buildDeckShareUrl } from '../domain/share/deckShareCodec'
import { useDeckSaveQueue } from '../hooks/useDeckSaveQueue'
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

type CopyResult = { status: 'copied' | 'error'; url: string }

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

type DeckEntryGroup = {
  key: 'oshi' | 'main' | 'cheer' | 'unknown'
  label: string
  entries: DeckEntry[]
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
  const { saveState, persist } = useDeckSaveQueue(repository)
  const [cardsState, setCardsState] = useState<CardLoadState>({
    status: 'loading',
  })
  const [cardsLoadAttempt, setCardsLoadAttempt] = useState(0)
  const [pickerState, setPickerState] = useState<SearchUrlState>(
    DEFAULT_SEARCH_URL_STATE,
  )
  const [isShareLinkVisible, setIsShareLinkVisible] = useState(false)
  const [copyResult, setCopyResult] = useState<CopyResult>()
  const deckRef = useRef(initialDeck)

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

  const pickerResults = useMemo(
    () =>
      getCardSearchResults(
        cardsState.status === 'loaded' ? cardsState.data.cards : [],
        { ...pickerState, pageSize: DEFAULT_CARD_PAGE_SIZE },
      ),
    [cardsState, pickerState],
  )

  const activeFilterCount =
    pickerState.colors.length +
    pickerState.cardTypes.length +
    pickerState.bloom.length +
    pickerState.criticalColors.length +
    pickerState.effectTags.length +
    (pickerState.sort === DEFAULT_SEARCH_URL_STATE.sort ? 0 : 1)

  const legality = useMemo(
    () =>
      cardsState.status === 'loaded'
        ? validateDeckLegality(deck, cardsState.data.cards)
        : undefined,
    [cardsState, deck],
  )

  const shareLink = useMemo(() => {
    if (!isShareLinkVisible) return undefined
    try {
      return {
        ok: true as const,
        value: buildDeckShareUrl(deck, window.location.origin),
      }
    } catch {
      return { ok: false as const }
    }
  }, [deck, isShareLinkVisible])

  const entryGroups = useMemo<DeckEntryGroup[]>(() => {
    if (cardsState.status !== 'loaded') {
      return deck.entries.length
        ? [{ key: 'unknown', label: 'カード', entries: deck.entries }]
        : []
    }
    const entriesByZone = {
      oshi: [] as DeckEntry[],
      main: [] as DeckEntry[],
      cheer: [] as DeckEntry[],
      unknown: [] as DeckEntry[],
    }
    for (const entry of deck.entries) {
      const card = cardsByNumber.get(entry.cardNumber)
      if (!card) {
        entriesByZone.unknown.push(entry)
        continue
      }
      try {
        entriesByZone[getDeckZone(card)].push(entry)
      } catch {
        entriesByZone.unknown.push(entry)
      }
    }
    return (Object.keys(entriesByZone) as (keyof typeof entriesByZone)[])
      .filter((key) => entriesByZone[key].length > 0)
      .map((key) => ({
        key,
        label: DECK_ZONE_LABELS[key],
        entries: entriesByZone[key],
      }))
  }, [cardsByNumber, cardsState.status, deck.entries])

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

  const updatePicker = (patch: Partial<SearchUrlState>) => {
    setPickerState((current) => ({ ...current, ...patch, page: 1 }))
  }

  const copyShareLink = async () => {
    if (shareLink?.ok !== true) return
    try {
      await navigator.clipboard.writeText(shareLink.value)
      setCopyResult({ status: 'copied', url: shareLink.value })
    } catch {
      setCopyResult({ status: 'error', url: shareLink.value })
    }
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
        {legality ? (
          <DeckLegalitySummary
            result={legality}
            cardsByNumber={cardsByNumber}
          />
        ) : (
          <p className="deck-legality-loading">構築ルールを確認しています…</p>
        )}
        <form className="deck-rename" onSubmit={submitRename}>
          <label htmlFor="deck-name">デッキ名</label>
          <div>
            <input
              id="deck-name"
              value={nameDraft}
              maxLength={DECK_NAME_MAX_LENGTH}
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
        <section className="deck-share" aria-labelledby="deck-share-heading">
          <h2 id="deck-share-heading">デッキを共有</h2>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setIsShareLinkVisible(true)}
          >
            共有リンクを作成
          </button>
          {shareLink?.ok === true && (
            <div className="deck-share__link">
              <label htmlFor="deck-share-url">共有URL</label>
              <div>
                <input
                  id="deck-share-url"
                  type="text"
                  readOnly
                  value={shareLink.value}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button
                  type="button"
                  className="button"
                  onClick={() => void copyShareLink()}
                >
                  コピー
                </button>
              </div>
              <p>共有URLにはデッキ名とカード構成が含まれます。</p>
              <p
                className="deck-share__copy-status"
                role="status"
                aria-live="polite"
              >
                {copyResult?.url === shareLink.value &&
                  copyResult.status === 'copied' &&
                  'コピーしました'}
                {copyResult?.url === shareLink.value &&
                  copyResult.status === 'error' &&
                  'コピーできませんでした。表示中のURLを手動でコピーしてください。'}
              </p>
            </div>
          )}
          {shareLink?.ok === false && (
            <p role="alert">
              現在のデッキから共有リンクを作成できませんでした。
            </p>
          )}
        </section>
      </section>

      <div className="deck-editor__columns">
        <section className="deck-panel" aria-labelledby="deck-entries-heading">
          <h2 id="deck-entries-heading">現在のカード</h2>
          {deck.entries.length === 0 ? (
            <p>カードが追加されていません。</p>
          ) : (
            <div className="deck-zone-list">
              {entryGroups.map((group) => (
                <section
                  className="deck-zone"
                  aria-labelledby={`deck-zone-${group.key}`}
                  key={group.key}
                >
                  <h3 id={`deck-zone-${group.key}`}>
                    {group.label}
                    <span>
                      {group.entries.reduce(
                        (total, entry) => total + entry.quantity,
                        0,
                      )}
                      枚
                    </span>
                  </h3>
                  <ul
                    className={
                      group.key === 'oshi'
                        ? 'deck-entry-list'
                        : 'deck-entry-list deck-entry-list--compact'
                    }
                  >
                    {group.entries.map((entry) => {
                      const card = cardsByNumber.get(entry.cardNumber)
                      const displayName = card?.name ?? entry.cardNumber
                      if (group.key !== 'oshi') {
                        return (
                          <li
                            className="deck-entry deck-entry--compact"
                            key={entry.cardNumber}
                          >
                            <DeckCardImage card={card} />
                            <DeckQuantityControl
                              cardName={displayName}
                              quantity={entry.quantity}
                              onDecrement={() =>
                                applyDeckChange((current) =>
                                  decrementCardQuantity(
                                    current,
                                    entry.cardNumber,
                                  ),
                                )
                              }
                              onIncrement={() =>
                                applyDeckChange((current) =>
                                  incrementCardQuantity(
                                    current,
                                    entry.cardNumber,
                                  ),
                                )
                              }
                            />
                            {cardsState.status === 'loaded' && !card && (
                              <span
                                className="deck-entry__warning"
                                role="alert"
                              >
                                カード情報なし
                              </span>
                            )}
                          </li>
                        )
                      }
                      return (
                        <li className="deck-entry" key={entry.cardNumber}>
                          <DeckCardImage card={card} />
                          <div className="deck-entry__information">
                            <h4>{displayName}</h4>
                            <p>{entry.cardNumber}</p>
                            {cardsState.status === 'loaded' && !card && (
                              <p className="deck-entry__warning" role="alert">
                                カードデータに存在しないカードです
                              </p>
                            )}
                          </div>
                          <DeckQuantityControl
                            cardName={displayName}
                            quantity={entry.quantity}
                            onDecrement={() =>
                              applyDeckChange((current) =>
                                decrementCardQuantity(
                                  current,
                                  entry.cardNumber,
                                ),
                              )
                            }
                            onIncrement={() =>
                              applyDeckChange((current) =>
                                incrementCardQuantity(
                                  current,
                                  entry.cardNumber,
                                ),
                              )
                            }
                          />
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
                </section>
              ))}
            </div>
          )}
        </section>

        <section className="deck-panel" aria-labelledby="add-card-heading">
          <h2 id="add-card-heading">カードを追加</h2>
          <label className="search-field" htmlFor="deck-card-search">
            <span>カード検索</span>
            <input
              id="deck-card-search"
              type="search"
              value={pickerState.query}
              placeholder="カード名・能力・Q&Aを検索…"
              onChange={(event) =>
                updatePicker({ query: event.currentTarget.value })
              }
            />
          </label>

          <details className="deck-picker-filters">
            <summary>
              詳細条件
              {activeFilterCount > 0 && `（${activeFilterCount}件）`}
            </summary>
            <CardSearchFilters
              state={pickerState}
              onChange={(patch) => updatePicker(patch)}
            />
            <div className="search-actions">
              <label htmlFor="deck-card-sort">
                並び順
                <select
                  id="deck-card-sort"
                  value={pickerState.sort}
                  onChange={(event) =>
                    updatePicker({
                      sort: event.currentTarget.value as SearchUrlState['sort'],
                    })
                  }
                >
                  <option value="default">標準</option>
                  <option value="card_number_asc">カード番号順</option>
                  <option value="release_date_desc">リリース日 新しい順</option>
                  <option value="release_date_asc">リリース日 古い順</option>
                </select>
              </label>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setPickerState(DEFAULT_SEARCH_URL_STATE)}
              >
                条件をクリア
              </button>
            </div>
          </details>

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
          {cardsState.status === 'loaded' && (
            <p className="deck-picker-result-count" aria-live="polite">
              {pickerResults.totalItems}件
            </p>
          )}
          {cardsState.status === 'loaded' && pickerResults.totalItems === 0 && (
            <div className="deck-picker-empty">
              <p>条件に一致するカードがありません。</p>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setPickerState(DEFAULT_SEARCH_URL_STATE)}
              >
                条件をクリア
              </button>
            </div>
          )}
          {pickerResults.items.length > 0 && (
            <>
              <ul className="deck-search-results">
                {pickerResults.items.map((card) => {
                  const quantity =
                    deck.entries.find(
                      (entry) => entry.cardNumber === card.cardNumber,
                    )?.quantity ?? 0
                  return (
                    <li key={card.cardNumber}>
                      <DeckCardImage card={card} />
                      <div>
                        <h3>{card.name}</h3>
                        <p>
                          {card.cardNumber}・{CARD_TYPE_LABELS[card.cardType]}
                        </p>
                      </div>
                      <DeckQuantityControl
                        cardName={card.name}
                        quantity={quantity}
                        onDecrement={() =>
                          applyDeckChange((current) =>
                            decrementCardQuantity(current, card.cardNumber),
                          )
                        }
                        onIncrement={() =>
                          applyDeckChange((current) =>
                            quantity > 0
                              ? incrementCardQuantity(current, card.cardNumber)
                              : addCardToDeck(current, card.cardNumber),
                          )
                        }
                      />
                    </li>
                  )
                })}
              </ul>
              {pickerResults.totalPages > 1 && (
                <nav className="pagination" aria-label="カード追加結果のページ">
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={!pickerResults.hasPreviousPage}
                    onClick={() =>
                      setPickerState((current) => ({
                        ...current,
                        page: pickerResults.page - 1,
                      }))
                    }
                  >
                    前へ
                  </button>
                  <span aria-current="page">
                    {pickerResults.page} / {pickerResults.totalPages}
                  </span>
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={!pickerResults.hasNextPage}
                    onClick={() =>
                      setPickerState((current) => ({
                        ...current,
                        page: pickerResults.page + 1,
                      }))
                    }
                  >
                    次へ
                  </button>
                </nav>
              )}
            </>
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
