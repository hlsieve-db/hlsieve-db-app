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
import { ProgressiveCardImage } from '../components/cards/ProgressiveCardImage'
import {
  hasInvalidTournamentDateRange,
  parseTournamentUrlState,
  serializeTournamentUrlState,
  type TournamentUrlState,
} from '../domain/tournaments/tournamentUrlState'
import type {
  TournamentIndexFile,
  TournamentOshiMasterFile,
} from '../domain/tournaments/types'
import {
  filterTournamentEvents,
  sortTournamentEvents,
  TOURNAMENT_NO_ENVIRONMENT,
  TOURNAMENT_PAGE_SIZE,
  tournamentEnvironmentLabel,
  tournamentTypeLabel,
} from '../domain/tournaments/ui'
import { useDocumentMetadata } from '../hooks/useDocumentMetadata'
import {
  loadTournamentIndex,
  loadTournamentOshiMaster,
} from '../repositories/loadTournamentData'

type IndexState =
  | { status: 'loading' }
  | { status: 'loaded'; data?: TournamentIndexFile }
  | { status: 'error' }

type OshiState =
  | { status: 'loading' }
  | { status: 'loaded'; data: TournamentOshiMasterFile }
  | { status: 'error' }

type TournamentListPageProps = {
  loadIndex?: () => Promise<TournamentIndexFile | undefined>
  loadOshiMaster?: () => Promise<TournamentOshiMasterFile>
}

function searchString(params: URLSearchParams): string {
  const value = params.toString()
  return value ? `?${value}` : ''
}

export function TournamentListPage({
  loadIndex = loadTournamentIndex,
  loadOshiMaster = loadTournamentOshiMaster,
}: TournamentListPageProps) {
  useDocumentMetadata({
    title: '大会データベース | HLSieve DB',
    description: 'ホロライブOCGの大会結果を大会名と店舗から探せます。',
    canonicalPath: '/tournaments',
  })
  const location = useLocation()
  const navigate = useNavigate()
  const [indexState, setIndexState] = useState<IndexState>({
    status: 'loading',
  })
  const [oshiState, setOshiState] = useState<OshiState>({ status: 'loading' })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const urlState = useMemo(
    () => parseTournamentUrlState(location.search),
    [location.search],
  )
  const canonicalSearch = useMemo(
    () => searchString(serializeTournamentUrlState(urlState)),
    [urlState],
  )
  const [venueDraft, setVenueDraft] = useState(urlState.venue ?? '')
  const isVenueComposing = useRef(false)

  useEffect(() => {
    if (!isVenueComposing.current) setVenueDraft(urlState.venue ?? '')
  }, [urlState.venue])

  useEffect(() => {
    if (location.search !== canonicalSearch) {
      navigate(
        { pathname: '/tournaments', search: canonicalSearch },
        { replace: true },
      )
    }
  }, [canonicalSearch, location.search, navigate])

  useEffect(() => {
    let active = true
    void loadIndex().then(
      (data) => active && setIndexState({ status: 'loaded', data }),
      () => active && setIndexState({ status: 'error' }),
    )
    void loadOshiMaster().then(
      (data) => active && setOshiState({ status: 'loaded', data }),
      () => active && setOshiState({ status: 'error' }),
    )
    return () => {
      active = false
    }
  }, [loadAttempt, loadIndex, loadOshiMaster])

  const events = useMemo(
    () =>
      indexState.status === 'loaded' ? (indexState.data?.events ?? []) : [],
    [indexState],
  )
  const invalidRange = hasInvalidTournamentDateRange(urlState)
  const filtered = useMemo(
    () =>
      invalidRange
        ? []
        : sortTournamentEvents(
            filterTournamentEvents(events, urlState),
            urlState.sort,
          ),
    [events, invalidRange, urlState],
  )
  const totalPages = Math.ceil(filtered.length / TOURNAMENT_PAGE_SIZE)
  const page = totalPages === 0 ? 1 : Math.min(urlState.page, totalPages)
  const visibleEvents = filtered.slice(
    (page - 1) * TOURNAMENT_PAGE_SIZE,
    page * TOURNAMENT_PAGE_SIZE,
  )

  useEffect(() => {
    if (indexState.status === 'loaded' && page !== urlState.page) {
      navigate(
        {
          pathname: '/tournaments',
          search: searchString(
            serializeTournamentUrlState({ ...urlState, page }),
          ),
        },
        { replace: true },
      )
    }
  }, [indexState.status, navigate, page, urlState])

  const update = (patch: Partial<TournamentUrlState>) => {
    navigate({
      pathname: '/tournaments',
      search: searchString(
        serializeTournamentUrlState({ ...urlState, ...patch, page: 1 }),
      ),
    })
  }
  const commitVenue = (venue: string) => {
    update({ venue: venue || undefined })
  }
  const handleVenueChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value
    setVenueDraft(value)
    if (!isVenueComposing.current) commitVenue(value)
  }
  const handleVenueCompositionStart = () => {
    isVenueComposing.current = true
  }
  const handleVenueCompositionEnd = (
    event: CompositionEvent<HTMLInputElement>,
  ) => {
    isVenueComposing.current = false
    const value = event.currentTarget.value
    setVenueDraft(value)
    commitVenue(value)
  }
  const changePage = (nextPage: number) => {
    navigate({
      pathname: '/tournaments',
      search: searchString(
        serializeTournamentUrlState({ ...urlState, page: nextPage }),
      ),
    })
  }
  const retry = () => {
    setIndexState({ status: 'loading' })
    setOshiState({ status: 'loading' })
    setLoadAttempt((value) => value + 1)
  }

  const types = [
    ...new Set(events.map((event) => event.tournament.type)),
  ].sort()
  const environments = [
    ...new Set(
      events.flatMap((event) =>
        event.tournament.environment ? [event.tournament.environment] : [],
      ),
    ),
  ].sort()
  const hasNoEnvironment = events.some((event) => !event.tournament.environment)
  const oshiOptions =
    oshiState.status === 'loaded'
      ? Object.entries(oshiState.data.cards).sort(
          ([leftNumber, left], [rightNumber, right]) =>
            left.name.localeCompare(right.name, 'ja') ||
            leftNumber.localeCompare(rightNumber),
        )
      : []

  return (
    <main id="main-content" className="deck-page tournament-list-page">
      <AppNavigation />
      <header className="tournament-list-page__heading">
        <p className="tournament-list-page__eyebrow">大会名＋店舗で探す</p>
        <h1>大会データベース</h1>
        <p>取得済みの公開大会結果を絞り込んで確認できます。</p>
      </header>

      <section
        className="tournament-filters"
        aria-labelledby="tournament-filter-heading"
      >
        <h2 id="tournament-filter-heading">大会を絞り込む</h2>
        <div className="tournament-filters__grid">
          <label>
            開始日
            <input
              type="date"
              value={urlState.from ?? ''}
              onChange={(event) =>
                update({ from: event.currentTarget.value || undefined })
              }
            />
          </label>
          <label>
            終了日
            <input
              type="date"
              value={urlState.to ?? ''}
              onChange={(event) =>
                update({ to: event.currentTarget.value || undefined })
              }
            />
          </label>
          <label>
            大会種別
            <select
              value={urlState.type ?? ''}
              onChange={(event) =>
                update({ type: event.currentTarget.value || undefined })
              }
            >
              <option value="">すべて</option>
              {types.map((type) => (
                <option key={type} value={type}>
                  {tournamentTypeLabel(type)}
                </option>
              ))}
            </select>
          </label>
          <label>
            環境
            <select
              value={urlState.environment ?? ''}
              onChange={(event) =>
                update({
                  environment: event.currentTarget.value || undefined,
                })
              }
            >
              <option value="">すべて</option>
              {hasNoEnvironment && (
                <option value={TOURNAMENT_NO_ENVIRONMENT}>環境指定なし</option>
              )}
              {environments.map((environment) => (
                <option key={environment} value={environment}>
                  {tournamentEnvironmentLabel(environment)}
                </option>
              ))}
            </select>
          </label>
          <label>
            推しホロメン
            <select
              value={urlState.oshi ?? ''}
              disabled={oshiState.status !== 'loaded'}
              onChange={(event) =>
                update({ oshi: event.currentTarget.value || undefined })
              }
            >
              <option value="">すべて</option>
              {urlState.oshi &&
                !oshiOptions.some(([number]) => number === urlState.oshi) && (
                  <option value={urlState.oshi}>{urlState.oshi}</option>
                )}
              {oshiOptions.map(([number, card]) => (
                <option key={number} value={number}>
                  {card.name}（{number}）
                </option>
              ))}
            </select>
          </label>
          <label>
            店舗名・都道府県
            <input
              type="search"
              value={venueDraft}
              onChange={handleVenueChange}
              onCompositionStart={handleVenueCompositionStart}
              onCompositionEnd={handleVenueCompositionEnd}
            />
          </label>
          <label>
            並び順
            <select
              value={urlState.sort}
              onChange={(event) =>
                update({
                  sort: event.currentTarget.value as TournamentUrlState['sort'],
                })
              }
            >
              <option value="date-desc">新しい大会順</option>
              <option value="date-asc">古い大会順</option>
            </select>
          </label>
        </div>
        {invalidRange && (
          <p className="status-message status-message--error" role="alert">
            開始日は終了日以前にしてください。
          </p>
        )}
        {oshiState.status === 'error' && (
          <p className="status-message" role="status">
            推しホロメンの絞り込みは現在利用できません。大会一覧はそのまま確認できます。
          </p>
        )}
      </section>

      {indexState.status === 'loading' && (
        <p className="status-message" role="status">
          大会データを読み込んでいます…
        </p>
      )}
      {indexState.status === 'error' && (
        <div className="status-message status-message--error" role="alert">
          <p>大会データを読み込めませんでした。</p>
          <button type="button" className="button" onClick={retry}>
            再試行
          </button>
        </div>
      )}
      {indexState.status === 'loaded' && events.length === 0 && (
        <p className="status-message">大会データは現在準備中です。</p>
      )}
      {indexState.status === 'loaded' &&
        events.length > 0 &&
        !invalidRange &&
        filtered.length === 0 && (
          <p className="status-message">条件に一致する大会はありません。</p>
        )}
      {indexState.status === 'loaded' && visibleEvents.length > 0 && (
        <section
          className="tournament-results"
          aria-labelledby="tournament-results-heading"
        >
          <div className="tournament-results__heading">
            <h2 id="tournament-results-heading">大会一覧</h2>
            <p>{filtered.length}件</p>
          </div>
          <ol
            className="tournament-event-list"
            start={(page - 1) * TOURNAMENT_PAGE_SIZE + 1}
          >
            {visibleEvents.map((event) => {
              const winner = event.results.find((result) => result.rank === 1)
              const winnerOshi =
                winner && oshiState.status === 'loaded'
                  ? oshiState.data.cards[winner.oshiCardNumber]
                  : undefined
              return (
                <li className="tournament-event-card" key={event.id}>
                  <article>
                    {winnerOshi?.representativeImageUrl && (
                      <div className="tournament-event-card__winner">
                        <ProgressiveCardImage
                          src={winnerOshi.representativeImageUrl}
                          alt=""
                          className="tournament-event-card__winner-image"
                        />
                        <p>
                          <span>優勝推し</span>
                          <strong>{winnerOshi.name}</strong>
                        </p>
                      </div>
                    )}
                    <div className="tournament-event-card__content">
                      <p className="tournament-event-card__date">
                        <time dateTime={event.date}>{event.date}</time>
                      </p>
                      <h3>
                        {event.tournament.seriesName}／{event.venue.name}
                      </h3>
                      <dl>
                        <div>
                          <dt>種別</dt>
                          <dd>{tournamentTypeLabel(event.tournament.type)}</dd>
                        </div>
                        {event.tournament.environment && (
                          <div>
                            <dt>環境</dt>
                            <dd>
                              {tournamentEnvironmentLabel(
                                event.tournament.environment,
                              )}
                            </dd>
                          </div>
                        )}
                        {event.venue.prefecture && (
                          <div>
                            <dt>都道府県</dt>
                            <dd>{event.venue.prefecture}</dd>
                          </div>
                        )}
                        {event.participantCount !== undefined && (
                          <div>
                            <dt>参加者</dt>
                            <dd>{event.participantCount}人</dd>
                          </div>
                        )}
                        <div>
                          <dt>取得結果</dt>
                          <dd>{event.resultCount}件</dd>
                        </div>
                      </dl>
                      <Link to={`/tournaments/${encodeURIComponent(event.id)}`}>
                        大会詳細を見る
                      </Link>
                    </div>
                  </article>
                </li>
              )
            })}
          </ol>
          {totalPages > 1 && (
            <nav
              className="pagination tournament-pagination"
              aria-label="大会一覧のページ"
            >
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => changePage(page - 1)}
              >
                前へ
              </button>
              <span aria-current="page">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => changePage(page + 1)}
              >
                次へ
              </button>
            </nav>
          )}
        </section>
      )}
    </main>
  )
}
