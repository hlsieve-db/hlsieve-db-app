import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CompositionEvent,
} from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { AppNavigation } from '../components/AppNavigation'
import type { CardsDataFile } from '../domain/cards/types'
import {
  buildOfficialQaSearchIndex,
  searchOfficialQa,
} from '../domain/qa/officialQaSearch'
import {
  parseQaSearchUrlState,
  serializeQaSearchUrlState,
} from '../domain/qa/qaSearchUrlState'
import { QA_SEARCH_METADATA } from '../domain/site/metadata'
import { useDocumentMetadata } from '../hooks/useDocumentMetadata'
import { loadCardsData } from '../repositories/loadCardsData'

const QA_PAGE_SIZE = 20

type QaDataState =
  | { status: 'loading' }
  | { status: 'loaded'; data: CardsDataFile }
  | { status: 'error' }

type QaSearchPageProps = {
  loadCards?: () => Promise<CardsDataFile>
}

function toSearch(params: URLSearchParams): string {
  const value = params.toString()
  return value ? `?${value}` : ''
}

export function QaSearchPage({ loadCards = loadCardsData }: QaSearchPageProps) {
  useDocumentMetadata(QA_SEARCH_METADATA)
  const location = useLocation()
  const navigate = useNavigate()
  const urlState = useMemo(
    () => parseQaSearchUrlState(location.search),
    [location.search],
  )
  const canonicalSearch = useMemo(
    () => toSearch(serializeQaSearchUrlState(urlState)),
    [urlState],
  )
  const [dataState, setDataState] = useState<QaDataState>({ status: 'loading' })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [queryDraft, setQueryDraft] = useState(urlState.query)
  const composing = useRef(false)

  useEffect(() => {
    let active = true
    void loadCards().then(
      (data) => active && setDataState({ status: 'loaded', data }),
      () => active && setDataState({ status: 'error' }),
    )
    return () => {
      active = false
    }
  }, [loadAttempt, loadCards])

  useEffect(() => {
    if (location.search !== canonicalSearch) {
      navigate({ pathname: '/qa', search: canonicalSearch }, { replace: true })
    }
  }, [canonicalSearch, location.search, navigate])

  useEffect(() => {
    if (!composing.current) setQueryDraft(urlState.query)
  }, [urlState.query])

  const index = useMemo(
    () =>
      buildOfficialQaSearchIndex(
        dataState.status === 'loaded' ? dataState.data.cards : [],
      ),
    [dataState],
  )
  const matches = useMemo(
    () => searchOfficialQa(index, urlState.query),
    [index, urlState.query],
  )
  const totalPages = Math.ceil(matches.length / QA_PAGE_SIZE)
  const page = totalPages === 0 ? 1 : Math.min(urlState.page, totalPages)
  const items = matches.slice((page - 1) * QA_PAGE_SIZE, page * QA_PAGE_SIZE)

  useEffect(() => {
    if (dataState.status === 'loaded' && page !== urlState.page) {
      navigate(
        {
          pathname: '/qa',
          search: toSearch(
            serializeQaSearchUrlState({ query: urlState.query, page }),
          ),
        },
        { replace: true },
      )
    }
  }, [dataState.status, navigate, page, urlState])

  const updateQuery = (query: string) => {
    navigate(
      {
        pathname: '/qa',
        search: toSearch(serializeQaSearchUrlState({ query, page: 1 })),
      },
      { replace: true },
    )
  }
  const changePage = (nextPage: number) => {
    navigate({
      pathname: '/qa',
      search: toSearch(
        serializeQaSearchUrlState({ query: urlState.query, page: nextPage }),
      ),
    })
  }
  const handleQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value
    setQueryDraft(value)
    if (!composing.current) updateQuery(value)
  }
  const handleCompositionEnd = (event: CompositionEvent<HTMLInputElement>) => {
    composing.current = false
    setQueryDraft(event.currentTarget.value)
    updateQuery(event.currentTarget.value)
  }

  return (
    <main className="content-page qa-search-page">
      <AppNavigation />
      <header className="content-page__header">
        <h1>公式Q&amp;A検索</h1>
        <p>
          ホロライブOFFICIAL CARD
          GAME公式サイトで公開されているQ&amp;Aを、HLSieve
          DB内のカード情報から検索できます。
        </p>
      </header>

      <section
        className="content-surface qa-search"
        aria-labelledby="qa-search-heading"
      >
        <h2 id="qa-search-heading">Q&amp;Aを探す</h2>
        <label className="qa-search__input" htmlFor="qa-search-query">
          <span>検索キーワード</span>
          <input
            id="qa-search-query"
            type="search"
            value={queryDraft}
            placeholder="Q番号・質問・回答・カード名で検索"
            onChange={handleQueryChange}
            onCompositionStart={() => {
              composing.current = true
            }}
            onCompositionEnd={handleCompositionEnd}
          />
        </label>
        <p className="qa-search__notice">
          実際の裁定は公式サイトの最新情報をご確認ください。
        </p>

        {dataState.status === 'loading' && (
          <p role="status">Q&amp;Aを読み込んでいます。</p>
        )}
        {dataState.status === 'error' && (
          <div role="alert" className="qa-search__error">
            <p>Q&amp;Aを読み込めませんでした。</p>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => {
                setDataState({ status: 'loading' })
                setLoadAttempt((attempt) => attempt + 1)
              }}
            >
              再試行
            </button>
          </div>
        )}
        {dataState.status === 'loaded' && !urlState.query && (
          <p className="qa-search__empty">
            Q番号・質問・回答などを入力してください。
          </p>
        )}
        {dataState.status === 'loaded' && urlState.query && (
          <section aria-labelledby="qa-results-heading">
            <div className="qa-search__summary">
              <h2 id="qa-results-heading">検索結果</h2>
              <p>
                <strong>{matches.length}件</strong>
                {totalPages > 0 && ` · ${page} / ${totalPages}ページ`}
              </p>
            </div>
            {matches.length === 0 ? (
              <p className="qa-search__empty">
                該当する公式Q&amp;Aはありません。
              </p>
            ) : (
              <ol
                className="qa-search-results"
                start={(page - 1) * QA_PAGE_SIZE + 1}
              >
                {items.map((qa) => (
                  <li key={qa.id} className="qa-search-result">
                    <article aria-labelledby={`qa-result-${qa.id}`}>
                      <header>
                        <h3 id={`qa-result-${qa.id}`}>{qa.id}</h3>
                        {qa.publishedAt && (
                          <time dateTime={qa.publishedAt}>
                            {qa.publishedAt}
                          </time>
                        )}
                      </header>
                      <div className="qa-search-result__copy">
                        <h4>質問</h4>
                        <p>{qa.question}</p>
                        <h4>回答</h4>
                        <p>{qa.answer}</p>
                      </div>
                      <div className="qa-search-result__related">
                        <h4>関連カード</h4>
                        <ul>
                          {qa.relatedCards.map(({ cardNumber, name }) => (
                            <li key={cardNumber}>
                              {name ? (
                                <Link
                                  to={`/cards/${encodeURIComponent(cardNumber)}`}
                                >
                                  {name} <span>{cardNumber}</span>
                                </Link>
                              ) : (
                                <span>
                                  {cardNumber}（現在のカード一覧では未解決）
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <a
                        className="qa-official-link"
                        href={qa.officialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        公式Q&amp;Aを見る
                      </a>
                    </article>
                  </li>
                ))}
              </ol>
            )}
            {totalPages > 1 && (
              <nav className="pagination" aria-label="Q&A検索結果のページ">
                <button
                  type="button"
                  className="button button--secondary"
                  disabled={page === 1}
                  onClick={() => changePage(page - 1)}
                >
                  前へ
                </button>
                <span aria-current="page">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  className="button button--secondary"
                  disabled={page === totalPages}
                  onClick={() => changePage(page + 1)}
                >
                  次へ
                </button>
              </nav>
            )}
          </section>
        )}
      </section>
    </main>
  )
}
