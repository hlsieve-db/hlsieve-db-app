import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { AppNavigation } from '../components/AppNavigation'
import { DeckLegalitySummary } from '../components/decks/DeckLegalitySummary'
import { DECK_ZONE_LABELS } from '../components/decks/constants'
import { CARD_TYPE_LABELS } from '../domain/cards/constants'
import type { Card, CardsDataFile } from '../domain/cards/types'
import { getDeckZone, validateDeckLegality } from '../domain/decks/legality'
import type { Deck } from '../domain/decks/types'
import {
  createDeckFromSharedPayload,
  decodeDeckSharePayload,
} from '../domain/share/deckShareCodec'
import type {
  DeckShareDecodeErrorCode,
  SharedDeckPayloadV1,
} from '../domain/share/types'
import {
  deckRepository,
  type DeckRepository,
} from '../repositories/deckRepository'
import { loadCardsData } from '../repositories/loadCardsData'
import { useDocumentMetadata } from '../hooks/useDocumentMetadata'

type CardLoadState =
  | { source: string; status: 'loading' }
  | { source: string; status: 'loaded'; data: CardsDataFile }
  | { source: string; status: 'error' }

type ImportState = {
  source: string
  status: 'idle' | 'saving' | 'error'
}

type SharedDeckPageProps = {
  repository?: DeckRepository
  loadCards?: () => Promise<CardsDataFile>
  createLocalDeck?: (payload: SharedDeckPayloadV1) => Deck
}

function decodeErrorMessage(code: DeckShareDecodeErrorCode): string {
  if (code === 'unsupported_version') {
    return '対応していないversionの共有デッキです。'
  }
  if (code === 'payload_too_large') {
    return '共有データがサイズ上限を超えています。'
  }
  return '壊れた共有データのため開けません。'
}

function SharedDeckCardImage({ card }: { card?: Card }) {
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

export function SharedDeckPage({
  repository = deckRepository,
  loadCards = loadCardsData,
  createLocalDeck = createDeckFromSharedPayload,
}: SharedDeckPageProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const encoded = searchParams.get('d')
  const decoded = useMemo(
    () => (encoded === null ? undefined : decodeDeckSharePayload(encoded)),
    [encoded],
  )
  const [cardsState, setCardsState] = useState<CardLoadState>({
    source: encoded ?? '',
    status: 'loading',
  })
  const [cardsLoadAttempt, setCardsLoadAttempt] = useState(0)
  const [importState, setImportState] = useState<ImportState>({
    source: encoded ?? '',
    status: 'idle',
  })
  const pendingImport = useRef<{ source: string; deck: Deck } | undefined>(
    undefined,
  )
  const source = encoded ?? ''
  const activeCardsState = useMemo<CardLoadState>(
    () =>
      cardsState.source === source ? cardsState : { source, status: 'loading' },
    [cardsState, source],
  )
  const activeImportState =
    importState.source === source ? importState.status : 'idle'

  useDocumentMetadata({
    title:
      decoded?.ok === true
        ? `${decoded.value.name} | HLSieve DB`
        : '共有デッキ | HLSieve DB',
    canonicalPath: '/deck/share',
    robots: 'noindex,follow',
  })

  useEffect(() => {
    if (decoded?.ok !== true) return
    let active = true
    void loadCards().then(
      (data) => {
        if (active) setCardsState({ source, status: 'loaded', data })
      },
      () => {
        if (active) setCardsState({ source, status: 'error' })
      },
    )
    return () => {
      active = false
    }
  }, [cardsLoadAttempt, decoded, loadCards, source])

  const cardsByNumber = useMemo(
    () =>
      new Map(
        activeCardsState.status === 'loaded'
          ? activeCardsState.data.cards.map((card) => [card.cardNumber, card])
          : [],
      ),
    [activeCardsState],
  )

  const previewDeck = useMemo<Deck | undefined>(
    () =>
      decoded?.ok === true
        ? {
            id: 'shared-preview',
            name: decoded.value.name,
            entries: decoded.value.entries,
            createdAt: '1970-01-01T00:00:00.000Z',
            updatedAt: '1970-01-01T00:00:00.000Z',
          }
        : undefined,
    [decoded],
  )

  const legality = useMemo(
    () =>
      previewDeck && activeCardsState.status === 'loaded'
        ? validateDeckLegality(previewDeck, activeCardsState.data.cards)
        : undefined,
    [activeCardsState, previewDeck],
  )

  const retryCards = () => {
    setCardsState({ source, status: 'loading' })
    setCardsLoadAttempt((attempt) => attempt + 1)
  }

  const importDeck = async (payload: SharedDeckPayloadV1) => {
    setImportState({ source, status: 'saving' })
    try {
      const deck =
        pendingImport.current?.source === source
          ? pendingImport.current.deck
          : createLocalDeck(payload)
      pendingImport.current = { source, deck }
      await repository.saveDeck(deck)
      navigate(`/decks/${encodeURIComponent(deck.id)}`)
    } catch {
      setImportState({ source, status: 'error' })
    }
  }

  return (
    <main className="deck-page shared-deck-page">
      <header className="deck-page__header">
        <AppNavigation />
        <Link className="back-link" to="/decks">
          保存デッキへ戻る
        </Link>
      </header>

      {encoded === null && (
        <section className="status-message">
          <h1>共有デッキ</h1>
          <p>共有デッキが指定されていません。</p>
        </section>
      )}

      {decoded?.ok === false && (
        <section className="status-message status-message--error" role="alert">
          <h1>共有デッキ</h1>
          <p>{decodeErrorMessage(decoded.error.code)}</p>
        </section>
      )}

      {decoded?.ok === true && (
        <>
          <section className="shared-deck-heading">
            <p className="shared-deck-heading__eyebrow">
              共有デッキのプレビュー
            </p>
            <h1>{decoded.value.name}</h1>
            <p>内容を確認してから、新しいローカルデッキとして保存できます。</p>
          </section>

          {activeCardsState.status === 'loading' && (
            <p className="status-message" role="status">
              カードデータを読み込んでいます…
            </p>
          )}
          {activeCardsState.status === 'error' && (
            <div className="status-message status-message--error" role="alert">
              <p>カードデータを読み込めませんでした。</p>
              <button type="button" className="button" onClick={retryCards}>
                再試行
              </button>
            </div>
          )}

          {activeCardsState.status === 'loaded' && legality && previewDeck && (
            <>
              <DeckLegalitySummary
                result={legality}
                cardsByNumber={cardsByNumber}
              />
              <section className="deck-panel" aria-labelledby="shared-entries">
                <h2 id="shared-entries">カード構成</h2>
                {previewDeck.entries.length === 0 ? (
                  <p>カードが含まれていません。</p>
                ) : (
                  <ul className="shared-deck-entries">
                    {previewDeck.entries.map((entry) => {
                      const card = cardsByNumber.get(entry.cardNumber)
                      const zone = card ? getDeckZone(card) : 'unknown'
                      return (
                        <li key={entry.cardNumber}>
                          <SharedDeckCardImage card={card} />
                          <div>
                            <h3>{card?.name ?? entry.cardNumber}</h3>
                            <p>{entry.cardNumber}</p>
                            <p>
                              {card
                                ? `${CARD_TYPE_LABELS[card.cardType]} / ${DECK_ZONE_LABELS[zone]}`
                                : DECK_ZONE_LABELS.unknown}
                            </p>
                            {!card && (
                              <p className="deck-entry__warning" role="alert">
                                現在のカードデータに存在しないカードです
                              </p>
                            )}
                          </div>
                          <strong>{entry.quantity}枚</strong>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              <section
                className="shared-deck-import"
                aria-label="共有デッキの保存"
              >
                <button
                  type="button"
                  className="button"
                  disabled={activeImportState === 'saving'}
                  onClick={() => void importDeck(decoded.value)}
                >
                  {activeImportState === 'saving'
                    ? '保存中…'
                    : 'このデッキを保存'}
                </button>
                {activeImportState === 'error' && (
                  <p role="alert">
                    デッキを保存できませんでした。再度ボタンを押してください。
                  </p>
                )}
              </section>
            </>
          )}
        </>
      )}
    </main>
  )
}
