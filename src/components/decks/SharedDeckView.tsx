import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { DeckLegalitySummary } from './DeckLegalitySummary'
import { DECK_ZONE_LABELS } from './constants'
import { CARD_TYPE_LABELS } from '../../domain/cards/constants'
import type { Card, CardsDataFile } from '../../domain/cards/types'
import { getDeckZone, validateDeckLegality } from '../../domain/decks/legality'
import type { Deck, DeckEntry, DeckZone } from '../../domain/decks/types'
import {
  getDeckDisplayCategory,
  sortDeckEntriesForDisplay,
} from '../../domain/decks/displayOrder'
import { createDeckFromSharedPayload } from '../../domain/share/deckShareCodec'
import type { SharedDeckPayloadV1 } from '../../domain/share/types'
import { type DeckRepository } from '../../repositories/deckRepository'
import { loadCardsData } from '../../repositories/loadCardsData'
import { useAppRepositories } from '../../repositories/useAppRepositories'

/**
 * The preview and import flow for a shared deck, once its payload is in hand.
 *
 * Both share routes render this: the long /deck/share?d=... link, which
 * decodes the payload out of the URL, and the short /s/<id> link, which fetches
 * it. Only the way the payload arrives differs, so only that lives in the
 * pages.
 */

type CardLoadState =
  | { source: string; status: 'loading' }
  | { source: string; status: 'loaded'; data: CardsDataFile }
  | { source: string; status: 'error' }

type ImportState = {
  source: string
  status: 'idle' | 'saving' | 'error'
}

type SharedDeckViewProps = {
  payload: SharedDeckPayloadV1
  /**
   * Identifies which share is on screen. Loading and import state are keyed by
   * it, so navigating from one share to another starts clean instead of
   * showing the previous deck's progress.
   */
  source: string
  repository?: DeckRepository
  loadCards?: () => Promise<CardsDataFile>
  createLocalDeck?: (payload: SharedDeckPayloadV1) => Deck
}

type SharedDeckEntryGroup = {
  key: DeckZone | 'unknown'
  label: string
  entries: DeckEntry[]
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

export function SharedDeckView({
  payload,
  source,
  repository: repositoryProp,
  loadCards = loadCardsData,
  createLocalDeck = createDeckFromSharedPayload,
}: SharedDeckViewProps) {
  const repositories = useAppRepositories()
  const repository = repositoryProp ?? repositories.decks
  const navigate = useNavigate()
  const [cardsState, setCardsState] = useState<CardLoadState>({
    source,
    status: 'loading',
  })
  const [cardsLoadAttempt, setCardsLoadAttempt] = useState(0)
  const [importState, setImportState] = useState<ImportState>({
    source,
    status: 'idle',
  })
  const pendingImport = useRef<{ source: string; deck: Deck } | undefined>(
    undefined,
  )
  const activeCardsState = useMemo<CardLoadState>(
    () =>
      cardsState.source === source ? cardsState : { source, status: 'loading' },
    [cardsState, source],
  )
  const activeImportState =
    importState.source === source ? importState.status : 'idle'

  useEffect(() => {
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
  }, [cardsLoadAttempt, loadCards, source])

  const cardsByNumber = useMemo(
    () =>
      new Map(
        activeCardsState.status === 'loaded'
          ? activeCardsState.data.cards.map((card) => [card.cardNumber, card])
          : [],
      ),
    [activeCardsState],
  )

  const previewDeck = useMemo<Deck>(
    () => ({
      id: 'shared-preview',
      name: payload.name,
      entries: payload.entries,
      createdAt: '1970-01-01T00:00:00.000Z',
      updatedAt: '1970-01-01T00:00:00.000Z',
    }),
    [payload],
  )

  const legality = useMemo(
    () =>
      activeCardsState.status === 'loaded'
        ? validateDeckLegality(previewDeck, activeCardsState.data.cards)
        : undefined,
    [activeCardsState, previewDeck],
  )

  const entryGroups = useMemo<SharedDeckEntryGroup[]>(() => {
    if (activeCardsState.status !== 'loaded') return []
    const groupedEntries: Record<DeckZone | 'unknown', DeckEntry[]> = {
      oshi: [],
      main: [],
      cheer: [],
      unknown: [],
    }
    for (const entry of sortDeckEntriesForDisplay(
      previewDeck.entries,
      cardsByNumber,
    )) {
      const card = cardsByNumber.get(entry.cardNumber)
      groupedEntries[
        card && getDeckDisplayCategory(card) !== 'unknown'
          ? getDeckZone(card)
          : 'unknown'
      ].push(entry)
    }
    return (['oshi', 'main', 'cheer', 'unknown'] as const)
      .filter((key) => groupedEntries[key].length > 0)
      .map((key) => ({
        key,
        label: DECK_ZONE_LABELS[key],
        entries: groupedEntries[key],
      }))
  }, [activeCardsState.status, cardsByNumber, previewDeck])

  const retryCards = () => {
    setCardsState({ source, status: 'loading' })
    setCardsLoadAttempt((attempt) => attempt + 1)
  }

  const importDeck = async () => {
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
    <>
      <section className="shared-deck-heading">
        <p className="shared-deck-heading__eyebrow">共有デッキのプレビュー</p>
        <h1>{payload.name}</h1>
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

      {activeCardsState.status === 'loaded' && legality && (
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
              <div className="shared-deck-zones">
                {entryGroups.map((group) => (
                  <section
                    className="shared-deck-zone"
                    aria-labelledby={`shared-deck-zone-${group.key}`}
                    key={group.key}
                  >
                    <h3 id={`shared-deck-zone-${group.key}`}>
                      {group.label}
                      <span>
                        {group.entries.reduce(
                          (total, entry) => total + entry.quantity,
                          0,
                        )}
                        枚
                      </span>
                    </h3>
                    <ul className="shared-deck-entries">
                      {group.entries.map((entry) => {
                        const card = cardsByNumber.get(entry.cardNumber)
                        return (
                          <li key={entry.cardNumber}>
                            <SharedDeckCardImage card={card} />
                            <div>
                              <h4>{card?.name ?? entry.cardNumber}</h4>
                              <p>{entry.cardNumber}</p>
                              <p>
                                {card
                                  ? CARD_TYPE_LABELS[card.cardType]
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
                  </section>
                ))}
              </div>
            )}
          </section>

          <section
            className="shared-deck-import"
            aria-label="共有デッキのインポート"
          >
            <h2>このデッキを使う</h2>
            <p>
              同じ名前のデッキがあっても、新しいローカルデッキとして追加します。
            </p>
            <button
              type="button"
              className="button"
              disabled={activeImportState === 'saving'}
              onClick={() => void importDeck()}
            >
              {activeImportState === 'saving'
                ? '追加中…'
                : '自分のデッキに追加'}
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
  )
}
