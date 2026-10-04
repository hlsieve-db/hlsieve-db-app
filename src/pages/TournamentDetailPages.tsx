import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { AppNavigation } from '../components/AppNavigation'
import { ProgressiveCardImage } from '../components/cards/ProgressiveCardImage'
import type { Card, CardsDataFile } from '../domain/cards/types'
import type { Deck, DeckEntry } from '../domain/decks/types'
import { sortDeckEntriesForDisplay } from '../domain/decks/displayOrder'
import { buildDeckLogPublicUrl } from '../domain/tournaments/deckLog'
import { convertTournamentResultToDeck } from '../domain/tournaments/deck'
import type {
  TournamentEvent,
  TournamentEventFile,
  TournamentIndexFile,
  TournamentOshiMasterFile,
  TournamentResult,
} from '../domain/tournaments/types'
import {
  tournamentEnvironmentLabel,
  tournamentTypeLabel,
  visibleTournamentResults,
} from '../domain/tournaments/ui'
import { useDocumentMetadata } from '../hooks/useDocumentMetadata'
import { loadCardsData } from '../repositories/loadCardsData'
import { useAppRepositories } from '../repositories/useAppRepositories'
import {
  loadTournamentEvent,
  loadTournamentIndex,
  loadTournamentOshiMaster,
  TournamentDataHttpError,
} from '../repositories/loadTournamentData'

type CoreState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; event: TournamentEvent }

type OptionalState<T> =
  { status: 'loading' } | { status: 'loaded'; data: T } | { status: 'error' }

type DetailPageProps = {
  loadIndex?: () => Promise<TournamentIndexFile | undefined>
  loadEvent?: (eventId: string) => Promise<TournamentEventFile>
  loadOshiMaster?: () => Promise<TournamentOshiMasterFile>
  loadCards?: () => Promise<CardsDataFile>
  convertResult?: typeof convertTournamentResultToDeck
}

function encoded(value: string): string {
  return encodeURIComponent(value)
}

function EventMetadata({ event }: { event: TournamentEvent }) {
  return (
    <dl className="tournament-detail-metadata">
      <div>
        <dt>種別</dt>
        <dd>{tournamentTypeLabel(event.tournament.type)}</dd>
      </div>
      {event.tournament.environment && (
        <div>
          <dt>環境</dt>
          <dd>{tournamentEnvironmentLabel(event.tournament.environment)}</dd>
        </div>
      )}
      <div>
        <dt>開催日</dt>
        <dd>
          <time dateTime={event.date}>{event.date}</time>
        </dd>
      </div>
      <div>
        <dt>会場</dt>
        <dd>{event.venue.name}</dd>
      </div>
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
    </dl>
  )
}

function useTournamentCore(
  eventId: string,
  loadIndex: () => Promise<TournamentIndexFile | undefined>,
  loadEvent: (eventId: string) => Promise<TournamentEventFile>,
  attempt: number,
): CoreState {
  const [state, setState] = useState<CoreState>({ status: 'loading' })
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const index = await loadIndex()
        if (!index || !index.events.some((event) => event.id === eventId)) {
          if (active) setState({ status: 'not-found' })
          return
        }
        const file = await loadEvent(eventId)
        if (file.event.id !== eventId) {
          throw new Error('Event IDが一致しません。')
        }
        if (file.dataVersion !== index.dataVersion) {
          throw new Error('大会データのversionが一致しません。')
        }
        if (active) setState({ status: 'loaded', event: file.event })
      } catch (error) {
        const message =
          error instanceof TournamentDataHttpError && error.status === 404
            ? '大会一覧には存在しますが、詳細データが見つかりません。'
            : '大会詳細データを読み込めませんでした。'
        if (active) setState({ status: 'error', message })
      }
    })()
    return () => {
      active = false
    }
  }, [attempt, eventId, loadEvent, loadIndex])
  return state
}

function useOptionalResource<T>(loader: () => Promise<T>, attempt: number) {
  const [state, setState] = useState<OptionalState<T>>({ status: 'loading' })
  useEffect(() => {
    let active = true
    void loader().then(
      (data) => active && setState({ status: 'loaded', data }),
      () => active && setState({ status: 'error' }),
    )
    return () => {
      active = false
    }
  }, [attempt, loader])
  return state
}

function OshiSummary({
  result,
  master,
  showImage = true,
}: {
  result: TournamentResult
  master?: TournamentOshiMasterFile
  showImage?: boolean
}) {
  const oshi = master?.cards[result.oshiCardNumber]
  return (
    <div
      className={`tournament-oshi-summary${showImage ? '' : ' tournament-oshi-summary--compact'}`}
    >
      {showImage && (
        <ProgressiveCardImage
          src={oshi?.representativeImageUrl}
          alt={oshi ? `${oshi.name}のカード画像` : '推しホロメン画像なし'}
          className="tournament-card-image"
        />
      )}
      <div>
        <p className="tournament-result-rank">{result.rank}位</p>
        <p>
          <strong>{oshi?.name ?? '名称不明'}</strong>
        </p>
        <p>{result.oshiCardNumber}</p>
      </div>
    </div>
  )
}

export function TournamentEventPage({
  loadIndex = loadTournamentIndex,
  loadEvent = loadTournamentEvent,
  loadOshiMaster: loadOshi = loadTournamentOshiMaster,
}: DetailPageProps) {
  const eventId = useParams().eventId ?? ''
  const [attempt, setAttempt] = useState(0)
  const core = useTournamentCore(eventId, loadIndex, loadEvent, attempt)
  const oshi = useOptionalResource(loadOshi, attempt)
  useDocumentMetadata({
    title: '大会詳細 | HLSieve DB',
    canonicalPath: `/tournaments/${encoded(eventId)}`,
  })

  return (
    <main className="page tournament-detail-page">
      <AppNavigation />
      <Link to="/tournaments">大会データベースへ戻る</Link>
      <h1>
        {core.status === 'loaded'
          ? core.event.tournament.seriesName
          : '大会詳細'}
      </h1>
      {core.status === 'loading' && (
        <p role="status">大会詳細を読み込んでいます…</p>
      )}
      {core.status === 'not-found' && <p>指定された大会は見つかりません。</p>}
      {core.status === 'error' && (
        <div role="alert">
          <p>{core.message}</p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            再試行
          </button>
        </div>
      )}
      {core.status === 'loaded' && (
        <>
          <EventMetadata event={core.event} />
          {oshi.status === 'error' && (
            <p role="status">推しホロメン情報を一部表示できません。</p>
          )}
          <section aria-labelledby="event-results-heading">
            <h2 id="event-results-heading">大会結果</h2>
            <ol className="tournament-result-list">
              {visibleTournamentResults(core.event.results).map((result) => (
                <li key={result.id} className="tournament-result-card">
                  <OshiSummary
                    result={result}
                    master={oshi.status === 'loaded' ? oshi.data : undefined}
                  />
                  <Link
                    to={`/tournaments/${encoded(core.event.id)}/results/${encoded(result.id)}`}
                  >
                    結果詳細を見る
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </main>
  )
}

function DeckZone({
  title,
  entries,
  cards,
  oshiMaster,
  isOshi = false,
}: {
  title: string
  entries: readonly DeckEntry[]
  cards?: ReadonlyMap<string, Card>
  oshiMaster?: TournamentOshiMasterFile
  isOshi?: boolean
}) {
  const sorted = sortDeckEntriesForDisplay(entries, cards ?? new Map())
  return (
    <section className="tournament-deck-zone">
      <h2>{title}</h2>
      <ul>
        {sorted.map((entry) => {
          const card = cards?.get(entry.cardNumber)
          const masterCard = isOshi
            ? oshiMaster?.cards[entry.cardNumber]
            : undefined
          const name = masterCard?.name ?? card?.name ?? '名称不明'
          const image = isOshi
            ? masterCard?.representativeImageUrl
            : (card?.representativeImageUrl ?? card?.imageUrl)
          return (
            <li key={entry.cardNumber} className="tournament-deck-entry">
              <ProgressiveCardImage
                src={image}
                alt={`${name}のカード画像`}
                className="tournament-card-image"
              />
              <div>
                <strong>{name}</strong>
                <span>{entry.cardNumber}</span>
                <span>{entry.quantity}枚</span>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

type TournamentCopyState = 'idle' | 'saving' | 'error'

function DeckLogSection({
  code,
  deckCopyState,
  onCopyToHlsieve,
}: {
  code?: string
  deckCopyState: TournamentCopyState
  onCopyToHlsieve: () => void
}) {
  const [clipboardState, setClipboardState] = useState<
    'idle' | 'success' | 'error'
  >('idle')
  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(code ?? '')
      setClipboardState('success')
    } catch {
      setClipboardState('error')
    }
  }
  return (
    <section className="tournament-deck-log">
      <h2>Deck Log</h2>
      {code ? (
        <>
          <p>Deck Code</p>
          <code>{code}</code>
        </>
      ) : (
        <p>Deck Codeなし</p>
      )}
      <div className="tournament-detail-actions">
        <button
          type="button"
          disabled={deckCopyState === 'saving'}
          onClick={onCopyToHlsieve}
        >
          {deckCopyState === 'saving' ? 'コピー中…' : 'HLSieveにコピー'}
        </button>
        {code && (
          <>
            <button type="button" onClick={() => void copy()}>
              コードをコピー
            </button>
            <a
              href={buildDeckLogPublicUrl(code)}
              target="_blank"
              rel="noopener noreferrer"
            >
              DECK LOGで見る（外部サイト）
            </a>
          </>
        )}
      </div>
      {deckCopyState === 'saving' && (
        <p role="status">デッキをコピーしています…</p>
      )}
      {deckCopyState === 'error' && (
        <p role="alert">
          デッキを保存できませんでした。もう一度お試しください。
        </p>
      )}
      {clipboardState === 'success' && (
        <p role="status">Deck Codeをコピーしました。</p>
      )}
      {clipboardState === 'error' && (
        <p role="alert">Deck Codeをコピーできませんでした。</p>
      )}
    </section>
  )
}

export function TournamentResultPage({
  loadIndex = loadTournamentIndex,
  loadEvent = loadTournamentEvent,
  loadOshiMaster: loadOshi = loadTournamentOshiMaster,
  loadCards = loadCardsData,
  convertResult = convertTournamentResultToDeck,
}: DetailPageProps) {
  const { eventId = '', resultId = '' } = useParams()
  const navigate = useNavigate()
  const repositories = useAppRepositories()
  const [attempt, setAttempt] = useState(0)
  const [deckCopyState, setDeckCopyState] = useState<{
    resultId: string
    status: TournamentCopyState
  }>({ resultId, status: 'idle' })
  const pendingCopy = useRef<{ resultId: string; deck: Deck } | undefined>(
    undefined,
  )
  const savingCopy = useRef(false)
  const core = useTournamentCore(eventId, loadIndex, loadEvent, attempt)
  const oshi = useOptionalResource(loadOshi, attempt)
  const cardData = useOptionalResource(loadCards, attempt)
  useDocumentMetadata({
    title: '大会結果詳細 | HLSieve DB',
    canonicalPath: `/tournaments/${encoded(eventId)}/results/${encoded(resultId)}`,
  })
  const result =
    core.status === 'loaded'
      ? core.event.results.find((item) => item.id === resultId)
      : undefined
  const cards = useMemo(
    () =>
      cardData.status === 'loaded'
        ? new Map(cardData.data.cards.map((card) => [card.cardNumber, card]))
        : undefined,
    [cardData],
  )
  const cardVersionsMatch =
    oshi.status !== 'loaded' ||
    cardData.status !== 'loaded' ||
    oshi.data.cardsDataVersion === cardData.data.dataVersion
  const usableCards = cardVersionsMatch ? cards : undefined
  const activeDeckCopyState =
    deckCopyState.resultId === resultId ? deckCopyState.status : 'idle'

  const copyToHlsieve = async () => {
    if (savingCopy.current || core.status !== 'loaded' || !result) return
    savingCopy.current = true
    setDeckCopyState({ resultId, status: 'saving' })
    const deck =
      pendingCopy.current?.resultId === resultId
        ? pendingCopy.current.deck
        : convertResult(core.event, result)
    pendingCopy.current = { resultId, deck }
    try {
      await repositories.decks.saveDeck(deck)
      navigate(`/decks/${encoded(deck.id)}`)
    } catch {
      setDeckCopyState({ resultId, status: 'error' })
    } finally {
      savingCopy.current = false
    }
  }

  return (
    <main className="page tournament-detail-page">
      <AppNavigation />
      <Link to={`/tournaments/${encoded(eventId)}`}>大会詳細へ戻る</Link>
      <h1>
        {core.status === 'loaded'
          ? `${core.event.tournament.seriesName} 大会結果`
          : '大会結果詳細'}
      </h1>
      {core.status === 'loading' && (
        <p role="status">大会結果を読み込んでいます…</p>
      )}
      {core.status === 'not-found' && <p>指定された大会は見つかりません。</p>}
      {core.status === 'error' && (
        <div role="alert">
          <p>{core.message}</p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            再試行
          </button>
        </div>
      )}
      {core.status === 'loaded' && !result && (
        <p>指定された大会結果は見つかりません。</p>
      )}
      {core.status === 'loaded' && result && (
        <>
          <EventMetadata event={core.event} />
          {(oshi.status === 'error' ||
            cardData.status === 'error' ||
            !cardVersionsMatch) && (
            <p role="status">
              カード情報を一部表示できません。カード番号と枚数は確認できます。
            </p>
          )}
          <section aria-labelledby="result-oshi-heading">
            <h2 id="result-oshi-heading">推しホロメン</h2>
            <OshiSummary
              result={result}
              master={oshi.status === 'loaded' ? oshi.data : undefined}
              showImage={false}
            />
          </section>
          <DeckLogSection
            code={result.deckLogCode}
            deckCopyState={activeDeckCopyState}
            onCopyToHlsieve={() => void copyToHlsieve()}
          />
          <DeckZone
            title="推しホロメン構成"
            entries={result.deck.oshi}
            cards={usableCards}
            oshiMaster={oshi.status === 'loaded' ? oshi.data : undefined}
            isOshi
          />
          <DeckZone
            title="メインデッキ"
            entries={result.deck.main}
            cards={usableCards}
          />
          <DeckZone
            title="エールデッキ"
            entries={result.deck.cheer}
            cards={usableCards}
          />
        </>
      )}
    </main>
  )
}
