import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { useAppRepositories } from '../repositories/useAppRepositories'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import { AppNavigation } from '../components/AppNavigation'
import { DeckAnalysisSummary } from '../components/decks/DeckAnalysisSummary'
import { DeckLegalitySummary } from '../components/decks/DeckLegalitySummary'
import { DeckQuantityControl } from '../components/decks/DeckQuantityControl'
import { DECK_ZONE_LABELS } from '../components/decks/constants'
import { CardSearchFilters } from '../components/search/CardSearchFilters'
import { assertCardPrintingsCompatibility } from '../domain/cards/cardPrintingsValidation'
import { CARD_TYPE_LABELS } from '../domain/cards/constants'
import { buildOriginalPrintingImageMap } from '../domain/cards/originalPrinting'
import type {
  Card,
  CardPrintingsDataFile,
  CardsDataFile,
} from '../domain/cards/types'
import { DECK_NAME_MAX_LENGTH } from '../domain/decks/constants'
import { analyzeDeck } from '../domain/decks/analysis'
import {
  addCardToDeck,
  decrementCardQuantity,
  getDeckTotal,
  incrementCardQuantity,
  removeCardFromDeck,
  renameDeck,
} from '../domain/decks/deck'
import { formatDeckAsText } from '../domain/decks/formatText'
import {
  getDeckDisplayCategory,
  sortDeckEntriesForDisplay,
} from '../domain/decks/displayOrder'
import { getDeckZone, validateDeckLegality } from '../domain/decks/legality'
import { CURRENT_DECK_RESTRICTIONS } from '../domain/decks/restrictions'
import { writeSelectedDeckId } from '../domain/decks/selectedDeckPreference'
import type { Deck, DeckEntry } from '../domain/decks/types'
import {
  deckEditorDetailState,
  deckEditorLocationState,
  deckEditorScrollPosition,
  deckEditorSearchState,
  type CardDetailReturnState,
  type DeckEditorScrollPosition,
} from '../domain/navigation/cardDetailReturnState'
import { DEFAULT_CARD_PAGE_SIZE } from '../domain/search/constants'
import { getCardSearchResults } from '../domain/search/getCardSearchResults'
import {
  DEFAULT_SEARCH_URL_STATE,
  type SearchUrlState,
} from '../domain/search/searchUrlState'
import {
  buildDeckShareUrl,
  buildDeckSharePayload,
} from '../domain/share/deckShareCodec'
import { buildShortShareUrl } from '../domain/share/shortShare'
import {
  createSupabaseDeckShareSource,
  type DeckShareSource,
  type ShortShareCreateFailure,
} from '../share/deckShareSource'
import { useDeckSaveQueue } from '../hooks/useDeckSaveQueue'
import { useDocumentMetadata } from '../hooks/useDocumentMetadata'
import { type DeckRepository } from '../repositories/deckRepository'
import { loadCardPrintingsData } from '../repositories/loadCardPrintingsData'
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

type PrintingLoadState =
  | { status: 'loading' }
  | { status: 'loaded'; data: CardPrintingsDataFile }
  | { status: 'error' }

type CopyResult = { status: 'copied' | 'error'; url: string }
type DeckTextCopyStatus = 'copied' | 'error'

type DeckEditPageProps = {
  repository?: DeckRepository
  loadCards?: () => Promise<CardsDataFile>
  loadPrintings?: () => Promise<CardPrintingsDataFile>
  /** Null stands for a build with no Supabase configured. */
  shareSource?: DeckShareSource | null
}

/** Short link creation, which is the only part of sharing that needs a server. */
type ShortShareState =
  | { status: 'idle' }
  | { status: 'creating' }
  | { status: 'created'; url: string }
  | { status: 'error'; reason: ShortShareCreateFailure }

function shortShareErrorMessage(reason: ShortShareCreateFailure): string {
  if (reason === 'sign-in-required') {
    return '短い共有リンクの作成にはログインが必要です。'
  }
  if (reason === 'too-large') {
    return 'このデッキは短いリンクのサイズ上限を超えています。上のURLをご利用ください。'
  }
  if (reason === 'invalid-deck') {
    return 'このデッキからは短いリンクを作成できませんでした。'
  }
  return '短いリンクを作成できませんでした。時間をおいて再度お試しください。'
}

function DeckEditFallbackMetadata() {
  useDocumentMetadata({
    title: 'デッキ編集 | HLSieve DB',
    robots: 'noindex,follow',
  })
  return null
}

function CardDetailLink({
  cardNumber,
  className,
  ariaLabel,
  buildDetailState,
  children,
}: {
  cardNumber: string
  className: string
  ariaLabel: string
  buildDetailState?: () => CardDetailReturnState
  children: ReactNode
}) {
  const navigate = useNavigate()
  const to = `/cards/${encodeURIComponent(cardNumber)}`

  return (
    <Link
      className={className}
      to={to}
      state={buildDetailState?.()}
      aria-label={ariaLabel}
      onClick={(event) => {
        if (!buildDetailState) return
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return
        }
        // Capture the scroll offsets as they are at click time, which is
        // newer than whatever the last render produced.
        event.preventDefault()
        navigate(to, { state: buildDetailState() })
      }}
    >
      {children}
    </Link>
  )
}

function DeckCardImage({
  card,
  imageUrl = card?.imageUrl,
  linkToDetail = false,
  buildDetailState,
}: {
  card?: Card
  imageUrl?: string
  linkToDetail?: boolean
  buildDetailState?: () => CardDetailReturnState
}) {
  const image = (
    <div className="deck-card-image">
      {imageUrl ? (
        <img src={imageUrl} alt="" loading="lazy" decoding="async" />
      ) : (
        <span>画像なし</span>
      )}
    </div>
  )
  return linkToDetail && card ? (
    <CardDetailLink
      className="deck-card-image-link"
      cardNumber={card.cardNumber}
      ariaLabel={`${card.name}のカード詳細を開く`}
      buildDetailState={buildDetailState}
    >
      {image}
    </CardDetailLink>
  ) : (
    image
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
  loadPrintings,
  shareSource,
  isSignedIn,
}: {
  initialDeck: Deck
  repository: DeckRepository
  loadCards: () => Promise<CardsDataFile>
  loadPrintings: () => Promise<CardPrintingsDataFile>
  shareSource: DeckShareSource | null
  isSignedIn: boolean
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const [deck, setDeck] = useState(initialDeck)
  const [nameDraft, setNameDraft] = useState(initialDeck.name)
  const [nameError, setNameError] = useState<string>()
  const { saveState, persist } = useDeckSaveQueue(repository)
  const [cardsState, setCardsState] = useState<CardLoadState>({
    status: 'loading',
  })
  const [cardsLoadAttempt, setCardsLoadAttempt] = useState(0)
  const [printingsState, setPrintingsState] = useState<PrintingLoadState>({
    status: 'loading',
  })
  const [pickerState, setPickerState] = useState<SearchUrlState>(
    () => deckEditorSearchState(location.state) ?? DEFAULT_SEARCH_URL_STATE,
  )
  const [isShareLinkVisible, setIsShareLinkVisible] = useState(false)
  const [copyResult, setCopyResult] = useState<CopyResult>()
  const [shortShare, setShortShare] = useState<ShortShareState>({
    status: 'idle',
  })
  const [deckTextCopyStatus, setDeckTextCopyStatus] =
    useState<DeckTextCopyStatus>()
  const deckRef = useRef(initialDeck)
  const searchResultsRef = useRef<HTMLUListElement>(null)
  // Only ever set from the entry this page was mounted with, so a direct
  // visit or a later in-page navigation never restores a stale offset.
  const scrollToRestoreRef = useRef<DeckEditorScrollPosition | undefined>(
    deckEditorScrollPosition(location.state),
  )

  const captureDetailState = useCallback(
    (): CardDetailReturnState =>
      deckEditorDetailState(initialDeck.id, pickerState, {
        pageScrollY: window.scrollY,
        resultScrollTop: searchResultsRef.current?.scrollTop ?? 0,
      }),
    [initialDeck.id, pickerState],
  )

  useEffect(() => {
    navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true, state: deckEditorLocationState(pickerState) },
    )
  }, [location.pathname, location.search, navigate, pickerState])

  useEffect(() => {
    // The picker state is restored synchronously on mount, so waiting for the
    // cards to load is enough to guarantee the search results (and their
    // page) are laid out before the offsets are applied.
    const target = scrollToRestoreRef.current
    if (!target || cardsState.status !== 'loaded') return
    scrollToRestoreRef.current = undefined
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: target.pageScrollY, left: 0 })
      if (searchResultsRef.current) {
        searchResultsRef.current.scrollTop = target.resultScrollTop
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [cardsState.status])

  useDocumentMetadata({
    title: `${deck.name} | HLSieve DB`,
    canonicalPath: `/decks/${encodeURIComponent(deck.id)}`,
    robots: 'noindex,follow',
  })

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

  useEffect(() => {
    let active = true
    void loadPrintings().then(
      (data) => {
        if (active) setPrintingsState({ status: 'loaded', data })
      },
      () => {
        if (active) setPrintingsState({ status: 'error' })
      },
    )
    return () => {
      active = false
    }
  }, [loadPrintings])

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
        {
          ...pickerState,
          pageSize: DEFAULT_CARD_PAGE_SIZE,
        },
      ),
    [cardsState, pickerState],
  )

  const originalPrintingImages = useMemo(() => {
    if (cardsState.status !== 'loaded' || printingsState.status !== 'loaded') {
      return new Map<string, string>()
    }
    try {
      assertCardPrintingsCompatibility(
        cardsState.data.dataVersion,
        printingsState.data,
      )
    } catch {
      return new Map<string, string>()
    }
    return buildOriginalPrintingImageMap(
      cardsState.data.cards,
      printingsState.data.cards,
    )
  }, [cardsState, printingsState])

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

  const analysis = useMemo(
    () =>
      cardsState.status === 'loaded'
        ? analyzeDeck({
            deck,
            cards: cardsState.data.cards,
            restrictions: CURRENT_DECK_RESTRICTIONS,
          })
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

  const deckText = useMemo(
    () =>
      cardsState.status === 'loaded'
        ? formatDeckAsText({ deck, cards: cardsState.data.cards })
        : undefined,
    [cardsState, deck],
  )

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
    for (const entry of sortDeckEntriesForDisplay(
      deck.entries,
      cardsByNumber,
    )) {
      const card = cardsByNumber.get(entry.cardNumber)
      if (!card) {
        entriesByZone.unknown.push(entry)
        continue
      }
      if (getDeckDisplayCategory(card) === 'unknown') {
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

  const createShortShare = async () => {
    if (!shareSource) return
    setShortShare({ status: 'creating' })
    let payload
    try {
      // The same payload the long URL carries, so a deck one link refuses is
      // refused by the other.
      payload = buildDeckSharePayload(deck)
    } catch {
      setShortShare({ status: 'error', reason: 'invalid-deck' })
      return
    }
    const result = await shareSource.createShare(payload)
    setShortShare(
      result.ok
        ? {
            status: 'created',
            url: buildShortShareUrl(result.shareId, window.location.origin),
          }
        : { status: 'error', reason: result.reason },
    )
  }

  const copyShortShare = async () => {
    if (shortShare.status !== 'created') return
    try {
      await navigator.clipboard.writeText(shortShare.url)
      setCopyResult({ status: 'copied', url: shortShare.url })
    } catch {
      setCopyResult({ status: 'error', url: shortShare.url })
    }
  }

  const copyDeckText = async () => {
    if (!deckText || deck.entries.length === 0) return
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Unavailable')
      await navigator.clipboard.writeText(deckText)
      setDeckTextCopyStatus('copied')
    } catch {
      setDeckTextCopyStatus('error')
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
              type="text"
              inputMode="text"
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

          {/* Offered only where a server is configured. Without one the long
              URL above is still the whole feature, exactly as before. */}
          {shareSource && shareLink?.ok === true && (
            <div className="deck-share__short">
              {/* Kept visible while signed out, so the option is discoverable
                  and the requirement is explained, rather than the button
                  silently not being there. The long URL above needs no
                  account and is unaffected. */}
              <button
                type="button"
                className="button button--secondary"
                disabled={!isSignedIn || shortShare.status === 'creating'}
                onClick={() => void createShortShare()}
              >
                {shortShare.status === 'creating'
                  ? '短いリンクを作成しています…'
                  : '短いリンクを作成'}
              </button>
              {!isSignedIn && (
                <p className="deck-share__short-note">
                  短い共有リンクの作成にはログインが必要です。上の共有URLはログインなしで利用できます。
                </p>
              )}
              {shortShare.status === 'created' && (
                <div className="deck-share__link">
                  <label htmlFor="deck-short-share-url">短い共有URL</label>
                  <div>
                    <input
                      id="deck-short-share-url"
                      type="text"
                      readOnly
                      value={shortShare.url}
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <button
                      type="button"
                      className="button"
                      onClick={() => void copyShortShare()}
                    >
                      コピー
                    </button>
                  </div>
                  <p>
                    作成した時点のデッキ内容を保存します。あとでデッキを編集しても、このリンクの内容は変わりません。
                  </p>
                  <p
                    className="deck-share__copy-status"
                    role="status"
                    aria-live="polite"
                  >
                    {copyResult?.url === shortShare.url &&
                      copyResult.status === 'copied' &&
                      'コピーしました'}
                    {copyResult?.url === shortShare.url &&
                      copyResult.status === 'error' &&
                      'コピーできませんでした。表示中のURLを手動でコピーしてください。'}
                  </p>
                </div>
              )}
              {shortShare.status === 'error' && (
                <p role="alert">{shortShareErrorMessage(shortShare.reason)}</p>
              )}
            </div>
          )}
        </section>
        <section
          className="deck-text-export"
          aria-labelledby="deck-text-export-heading"
        >
          <h2 id="deck-text-export-heading">デッキリスト</h2>
          <p>SNSやメモへ貼り付けやすいテキスト形式でコピーします。</p>
          <button
            type="button"
            className="button button--secondary"
            aria-label="デッキリストをテキストでコピー"
            disabled={deck.entries.length === 0 || !deckText}
            onClick={() => void copyDeckText()}
          >
            テキストをコピー
          </button>
          {deck.entries.length === 0 && <p>デッキにカードがありません。</p>}
          {deck.entries.length > 0 && cardsState.status === 'loading' && (
            <p>カードデータを読み込んでいます…</p>
          )}
          {deck.entries.length > 0 && cardsState.status === 'error' && (
            <p role="alert">カードデータの読み込み後にコピーできます。</p>
          )}
          {deckTextCopyStatus === 'copied' && (
            <p
              className="deck-text-export__status"
              role="status"
              aria-live="polite"
            >
              デッキリストをコピーしました。
            </p>
          )}
          {deckTextCopyStatus === 'error' && (
            <p className="deck-text-export__status" role="alert">
              コピーできませんでした。
            </p>
          )}
        </section>
      </section>

      {analysis && cardsState.status === 'loaded' && (
        <DeckAnalysisSummary
          analysis={analysis}
          cards={cardsState.data.cards}
        />
      )}

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
                            <DeckCardImage
                              card={card}
                              linkToDetail
                              buildDetailState={captureDetailState}
                            />
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
                          <DeckCardImage
                            card={card}
                            linkToDetail
                            buildDetailState={captureDetailState}
                          />
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
              type="text"
              inputMode="text"
              value={pickerState.query}
              placeholder="カード名・能力・Q&Aを検索…"
              onChange={(event) =>
                updatePicker({ query: event.currentTarget.value })
              }
            />
          </label>
          <label className="search-query-option">
            <input
              type="checkbox"
              checked={pickerState.includeQa}
              onChange={(event) =>
                updatePicker({ includeQa: event.currentTarget.checked })
              }
            />
            <span>Q&amp;Aを含める</span>
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
              <ul className="deck-search-results" ref={searchResultsRef}>
                {pickerResults.items.map((card) => {
                  const quantity =
                    deck.entries.find(
                      (entry) => entry.cardNumber === card.cardNumber,
                    )?.quantity ?? 0
                  return (
                    <li key={card.cardNumber}>
                      <CardDetailLink
                        className="deck-search-result__detail-link"
                        cardNumber={card.cardNumber}
                        ariaLabel={`${card.name}のカード詳細を開く`}
                        buildDetailState={captureDetailState}
                      >
                        <DeckCardImage
                          card={card}
                          imageUrl={originalPrintingImages.get(card.cardNumber)}
                        />
                        <div>
                          <h3>{card.name}</h3>
                          <p>
                            {card.cardNumber}・{CARD_TYPE_LABELS[card.cardType]}
                          </p>
                        </div>
                      </CardDetailLink>
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
  repository: repositoryProp,
  loadCards = loadCardsData,
  loadPrintings = loadCardPrintingsData,
  shareSource: shareSourceProp,
}: DeckEditPageProps) {
  const { state: authState } = useAuth()
  // Resolved once: a test supplies a fake, and a build with no keys gets null.
  const shareSource = useMemo(
    () =>
      shareSourceProp === undefined
        ? createSupabaseDeckShareSource()
        : shareSourceProp,
    [shareSourceProp],
  )
  const repositories = useAppRepositories()
  const repository = repositoryProp ?? repositories.decks
  const { namespace } = repositories
  const { deckId } = useParams<'deckId'>()
  const [state, setState] = useState<DeckLoadState>({ status: 'loading' })
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    let active = true
    if (!deckId) return
    void repository.getDeck(deckId).then(
      (deck) => {
        if (!active) return
        if (deck) writeSelectedDeckId(deck.id, window.localStorage, namespace)
        setState(deck ? { status: 'loaded', deck } : { status: 'not-found' })
      },
      () => {
        if (active) setState({ status: 'error' })
      },
    )
    return () => {
      active = false
    }
  }, [deckId, loadAttempt, namespace, repository])

  const retryLoad = () => {
    setState({ status: 'loading' })
    setLoadAttempt((attempt) => attempt + 1)
  }

  return (
    <main id="main-content" className="deck-page deck-editor">
      {state.status !== 'loaded' && <DeckEditFallbackMetadata />}
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
          loadPrintings={loadPrintings}
          shareSource={shareSource}
          isSignedIn={authState.status === 'authenticated'}
        />
      )}
    </main>
  )
}
