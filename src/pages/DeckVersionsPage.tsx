import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { AppNavigation } from '../components/AppNavigation'
import { DeckRegulationBadge } from '../components/decks/DeckRegulationBadge'
import { loadCardsData } from '../repositories/loadCardsData'
import type { Card, CardsDataFile } from '../domain/cards/types'
import { compareDecks } from '../domain/decks/comparison'
import { getDeckZone } from '../domain/decks/legality'
import { CURRENT_DECK_RESTRICTIONS } from '../domain/decks/restrictions'
import type { Deck } from '../domain/decks/types'
import { restoreDeckFromVersion } from '../domain/deckVersions/restore'
import type { DeckVersion } from '../domain/deckVersions/types'
import { useAppRepositories } from '../repositories/useAppRepositories'
import type { DeckRepository } from '../repositories/deckRepository'
import type { DeckVersionRepository } from '../repositories/deckVersionRepository'
import { formatDateTime } from '../utils/formatDateTime'

/**
 * The snapshots someone chose to keep of one deck.
 *
 * Reading, comparing and putting one back. Nothing here writes a snapshot: the
 * editor does that, and only when asked, so opening this page cannot add to the
 * list it is showing.
 */

type PageState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'loaded'; deck: Deck; versions: DeckVersion[] }
  | { status: 'error' }

export type DeckVersionsPageProps = {
  repository?: DeckRepository
  deckVersions?: DeckVersionRepository
  loadCards?: () => Promise<CardsDataFile>
}

/** The snapshot as a deck, so the existing comparison can read it. */
function asDeck(deck: Deck, version: DeckVersion): Deck {
  return restoreDeckFromVersion(deck, version, { now: () => deck.updatedAt })
}

function zoneCounts(
  version: DeckVersion,
  cards: readonly Card[],
): { oshi: number; main: number; cheer: number; unknown: number } {
  const byNumber = new Map(cards.map((card) => [card.cardNumber, card]))
  const counts = { oshi: 0, main: 0, cheer: 0, unknown: 0 }
  for (const entry of version.snapshot.entries) {
    const card = byNumber.get(entry.cardNumber)
    if (!card) {
      counts.unknown += entry.quantity
      continue
    }
    try {
      counts[getDeckZone(card)] += entry.quantity
    } catch {
      counts.unknown += entry.quantity
    }
  }
  return counts
}

export function DeckVersionsPage({
  repository: repositoryProp,
  deckVersions: deckVersionsProp,
  loadCards = loadCardsData,
}: DeckVersionsPageProps = {}) {
  const repositories = useAppRepositories()
  const repository = repositoryProp ?? repositories.decks
  const versionRepository = deckVersionsProp ?? repositories.deckVersions
  const { deckId = '' } = useParams()
  const navigate = useNavigate()

  const [state, setState] = useState<PageState>({ status: 'loading' })
  const [cards, setCards] = useState<readonly Card[]>([])
  const [comparingId, setComparingId] = useState<string>()
  const [restoringId, setRestoringId] = useState<string>()
  const [deletingId, setDeletingId] = useState<string>()
  const [operationError, setOperationError] = useState<string>()
  const [notice, setNotice] = useState<string>()

  const read = useCallback(async (): Promise<PageState> => {
    const deck = await repository.getDeck(deckId)
    if (!deck) return { status: 'missing' }
    return {
      status: 'loaded',
      deck,
      versions: await versionRepository.listVersions(deckId),
    }
  }, [deckId, repository, versionRepository])

  const load = useCallback(
    () =>
      read().then(
        (next) => setState(next),
        () => setState({ status: 'error' }),
      ),
    [read],
  )

  useEffect(() => {
    let active = true
    void read().then(
      (next) => {
        if (active) setState(next)
      },
      () => {
        if (active) setState({ status: 'error' })
      },
    )
    return () => {
      active = false
    }
  }, [read])

  useEffect(() => {
    let cancelled = false
    void loadCards().then(
      (data) => {
        if (!cancelled) setCards(data.cards)
      },
      () => {
        // The list still reads without card data; only the zone counts and the
        // comparison need it.
      },
    )
    return () => {
      cancelled = true
    }
  }, [loadCards])

  const comparison = useMemo(() => {
    if (state.status !== 'loaded' || comparingId === undefined) return undefined
    const version = state.versions.find((value) => value.id === comparingId)
    if (!version || cards.length === 0) return undefined
    return compareDecks({
      beforeDeck: asDeck(state.deck, version),
      afterDeck: state.deck,
      cards,
      restrictions: CURRENT_DECK_RESTRICTIONS,
    })
  }, [cards, comparingId, state])

  const handleRestore = async (version: DeckVersion) => {
    if (state.status !== 'loaded') return
    setOperationError(undefined)
    try {
      // The same deck, put back to how it was: its id and the day it was made
      // do not change, and no snapshot is taken on the way.
      await repository.saveDeck(restoreDeckFromVersion(state.deck, version))
      setRestoringId(undefined)
      setNotice(`「${version.label}」の内容を復元しました。`)
      await load()
    } catch {
      setOperationError('バージョンを復元できませんでした。')
    }
  }

  const handleDelete = async (version: DeckVersion) => {
    setOperationError(undefined)
    try {
      await versionRepository.deleteVersion(version.id)
      setDeletingId(undefined)
      setNotice(`「${version.label}」を削除しました。`)
      await load()
    } catch {
      setOperationError('バージョンを削除できませんでした。')
    }
  }

  return (
    <main id="main-content" className="deck-page deck-versions-page">
      <AppNavigation />
      <header className="content-page__header">
        <h1>バージョン</h1>
        {state.status === 'loaded' && (
          <p>
            <Link to={`/decks/${encodeURIComponent(state.deck.id)}`}>
              {state.deck.name}
            </Link>
          </p>
        )}
      </header>

      {state.status === 'loading' && <p role="status">読み込んでいます…</p>}

      {state.status === 'missing' && (
        <p className="status-message">デッキが見つかりません。</p>
      )}

      {state.status === 'error' && (
        <div className="status-message status-message--error" role="alert">
          <p>バージョンを読み込めませんでした。</p>
          <button type="button" className="button" onClick={() => void load()}>
            再試行
          </button>
        </div>
      )}

      {operationError !== undefined && (
        <p className="status-message status-message--error" role="alert">
          {operationError}
        </p>
      )}
      {notice !== undefined && <p role="status">{notice}</p>}

      {state.status === 'loaded' && state.versions.length === 0 && (
        <p className="status-message">
          保存されたバージョンはありません。デッキ編集画面から保存できます。
        </p>
      )}

      {state.status === 'loaded' && state.versions.length > 0 && (
        <ul className="deck-version-list">
          {state.versions.map((version) => {
            const counts = zoneCounts(version, cards)
            return (
              <li className="deck-version" key={version.id}>
                <h2>{version.label}</h2>
                <p>
                  <time dateTime={version.createdAt}>
                    保存 {formatDateTime(version.createdAt)}
                  </time>
                </p>
                <p>
                  <DeckRegulationBadge
                    regulationId={version.snapshot.regulationId}
                  />
                </p>
                <p>
                  {`推し ${counts.oshi}枚・メイン ${counts.main}枚・エール ${counts.cheer}枚`}
                </p>

                <div className="deck-version__actions">
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() =>
                      setComparingId((current) =>
                        current === version.id ? undefined : version.id,
                      )
                    }
                  >
                    現在と比較
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => setRestoringId(version.id)}
                  >
                    このバージョンを復元
                  </button>
                  <button
                    type="button"
                    className="button button--danger"
                    aria-label={`${version.label}を削除`}
                    onClick={() => setDeletingId(version.id)}
                  >
                    削除
                  </button>
                </div>

                {/* Restoring replaces what is in the editor now, so it is
                    asked for twice, like deleting a deck. */}
                {restoringId === version.id && (
                  <div
                    className="delete-confirmation"
                    role="alertdialog"
                    aria-label="バージョン復元の確認"
                  >
                    <p>
                      「{version.label}」の内容を現在のデッキへ復元しますか？
                      現在の内容は置き換わります。
                    </p>
                    <div>
                      <button
                        type="button"
                        className="button"
                        onClick={() => void handleRestore(version)}
                      >
                        復元する
                      </button>
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => setRestoringId(undefined)}
                      >
                        やめる
                      </button>
                    </div>
                  </div>
                )}

                {deletingId === version.id && (
                  <div
                    className="delete-confirmation"
                    role="alertdialog"
                    aria-label="バージョン削除の確認"
                  >
                    <p>「{version.label}」を削除しますか？</p>
                    <div>
                      <button
                        type="button"
                        className="button button--danger"
                        onClick={() => void handleDelete(version)}
                      >
                        削除する
                      </button>
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => setDeletingId(undefined)}
                      >
                        やめる
                      </button>
                    </div>
                  </div>
                )}

                {comparingId === version.id && (
                  <div className="deck-version__comparison">
                    {comparison === undefined ? (
                      <p role="status">カードデータを読み込んでいます…</p>
                    ) : comparison.cardChanges.length === 0 ? (
                      <p>現在のデッキと同じ内容です。</p>
                    ) : (
                      <ul>
                        {comparison.cardChanges.map((change) => (
                          <li key={change.cardNumber}>
                            {`${change.name ?? change.cardNumber} ${change.beforeQuantity}枚 → ${change.afterQuantity}枚`}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <p>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => navigate('/decks')}
        >
          保存デッキへ戻る
        </button>
      </p>
    </main>
  )
}
