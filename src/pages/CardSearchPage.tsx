import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CompositionEvent,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { AppNavigation } from '../components/AppNavigation'
import { DeckTargetSelector } from '../components/decks/DeckTargetSelector'
import { CardSearchFilters } from '../components/search/CardSearchFilters'
import { CardSearchResults } from '../components/search/CardSearchResults'
import type { CardsDataFile } from '../domain/cards/types'
import { DEFAULT_CARD_PAGE_SIZE } from '../domain/search/constants'
import { getCardSearchResults } from '../domain/search/getCardSearchResults'
import {
  DEFAULT_SEARCH_URL_STATE,
  parseSearchUrlState,
  serializeSearchUrlState,
  type SearchUrlState,
} from '../domain/search/searchUrlState'
import { loadCardsData } from '../repositories/loadCardsData'
import {
  deckRepository,
  type DeckRepository,
} from '../repositories/deckRepository'
import { useSavedDeckQuickEdit } from '../hooks/useSavedDeckQuickEdit'

type CardDataState =
  | { status: 'loading' }
  | { status: 'loaded'; data: CardsDataFile }
  | { status: 'error' }

type CardSearchPageProps = {
  loadCards?: () => Promise<CardsDataFile>
  repository?: DeckRepository
}

function searchString(params: URLSearchParams): string {
  const value = params.toString()
  return value ? `?${value}` : ''
}

export function CardSearchPage({
  loadCards = loadCardsData,
  repository = deckRepository,
}: CardSearchPageProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const urlState = useMemo(
    () => parseSearchUrlState(location.search),
    [location.search],
  )
  const canonicalSearch = useMemo(
    () => searchString(serializeSearchUrlState(urlState)),
    [urlState],
  )
  const [cardData, setCardData] = useState<CardDataState>({
    status: 'loading',
  })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [queryDraft, setQueryDraft] = useState(urlState.query)
  const isComposing = useRef(false)
  const deckQuickEdit = useSavedDeckQuickEdit(repository)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'カード検索 | HLSieve DB'
    return () => {
      document.title = previousTitle
    }
  }, [])

  const navigateToState = useCallback(
    (next: SearchUrlState, replace: boolean) => {
      navigate(
        {
          pathname: location.pathname,
          search: searchString(serializeSearchUrlState(next)),
        },
        { replace },
      )
    },
    [location.pathname, navigate],
  )

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

  useEffect(() => {
    if (location.search !== canonicalSearch) {
      navigate(
        { pathname: location.pathname, search: canonicalSearch },
        { replace: true },
      )
    }
  }, [canonicalSearch, location.pathname, location.search, navigate])

  useEffect(() => {
    if (!isComposing.current) setQueryDraft(urlState.query)
  }, [urlState.query])

  const results = useMemo(
    () =>
      getCardSearchResults(
        cardData.status === 'loaded' ? cardData.data.cards : [],
        {
          ...urlState,
          pageSize: DEFAULT_CARD_PAGE_SIZE,
        },
      ),
    [cardData, urlState],
  )

  useEffect(() => {
    if (cardData.status === 'loaded' && results.page !== urlState.page) {
      navigateToState({ ...urlState, page: results.page }, true)
    }
  }, [cardData.status, navigateToState, results.page, urlState])

  const updateSearch = (patch: Partial<SearchUrlState>, replace = false) => {
    navigateToState({ ...urlState, ...patch, page: 1 }, replace)
  }

  const commitQuery = (query: string) => {
    updateSearch({ query }, true)
  }

  const handleQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value
    setQueryDraft(value)
    if (!isComposing.current) commitQuery(value)
  }

  const handleCompositionStart = () => {
    isComposing.current = true
  }

  const handleCompositionEnd = (event: CompositionEvent<HTMLInputElement>) => {
    isComposing.current = false
    const value = event.currentTarget.value
    setQueryDraft(value)
    commitQuery(value)
  }

  const retryLoad = () => {
    setCardData({ status: 'loading' })
    setLoadAttempt((attempt) => attempt + 1)
  }

  return (
    <main className="search-page">
      <header className="search-page__header">
        <AppNavigation />
        <h1>カード検索</h1>
        <p>カード名、能力、Q&amp;Aから公式カードを探せます。</p>
      </header>

      <section className="search-panel" aria-label="カード検索条件">
        <label className="search-field" htmlFor="card-search-query">
          <span>キーワード</span>
          <input
            id="card-search-query"
            type="search"
            value={queryDraft}
            placeholder="カード名・能力・Q&Aを検索…"
            autoComplete="off"
            onChange={handleQueryChange}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
          />
        </label>

        <CardSearchFilters
          state={urlState}
          onChange={(patch) => updateSearch(patch)}
        />

        <div className="search-actions">
          <label htmlFor="card-sort">
            並び順
            <select
              id="card-sort"
              value={urlState.sort}
              onChange={(event) =>
                updateSearch({
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
            onClick={() => navigateToState(DEFAULT_SEARCH_URL_STATE, false)}
          >
            条件をクリア
          </button>
        </div>
      </section>

      <section
        className="deck-quick-add-panel search-deck-target"
        aria-labelledby="search-deck-target-heading"
      >
        <h2 id="search-deck-target-heading">デッキへ追加</h2>
        <DeckTargetSelector
          state={deckQuickEdit.state}
          decks={deckQuickEdit.decks}
          selectedDeckId={deckQuickEdit.selectedDeckId}
          saveState={deckQuickEdit.saveState}
          onSelect={deckQuickEdit.selectDeck}
          onRetry={deckQuickEdit.retry}
        />
      </section>

      {cardData.status === 'loading' && (
        <p className="status-message" role="status" aria-live="polite">
          カードデータを読み込んでいます…
        </p>
      )}

      {cardData.status === 'error' && (
        <div className="status-message status-message--error" role="alert">
          <p>カードデータを読み込めませんでした。</p>
          <button type="button" className="button" onClick={retryLoad}>
            再試行
          </button>
        </div>
      )}

      {cardData.status === 'loaded' && (
        <CardSearchResults
          result={results}
          onPrevious={() =>
            navigateToState({ ...urlState, page: results.page - 1 }, false)
          }
          onNext={() =>
            navigateToState({ ...urlState, page: results.page + 1 }, false)
          }
          onClear={() => navigateToState(DEFAULT_SEARCH_URL_STATE, false)}
          deckControls={{
            disabled: !deckQuickEdit.selectedDeck,
            quantityFor: deckQuickEdit.quantityFor,
            onDecrement: deckQuickEdit.decrement,
            onIncrement: deckQuickEdit.increment,
          }}
        />
      )}
    </main>
  )
}
