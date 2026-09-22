import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { AppNavigation } from '../components/AppNavigation'
import { SharedDeckView } from '../components/decks/SharedDeckView'
import type { CardsDataFile } from '../domain/cards/types'
import type { Deck } from '../domain/decks/types'
import type { SharedDeckPayloadV1 } from '../domain/share/types'
import { type DeckRepository } from '../repositories/deckRepository'
import {
  createSupabaseDeckShareSource,
  type DeckShareSource,
  type ShortShareLoadFailure,
} from '../share/deckShareSource'
import { useDocumentMetadata } from '../hooks/useDocumentMetadata'

/**
 * The short share link, /s/<shareId>.
 *
 * Only the way the deck arrives differs from the long link: it is fetched
 * rather than decoded out of the URL. Everything after that, the preview and
 * the import, is the same component.
 */

type ShortSharePageProps = {
  repository?: DeckRepository
  loadCards?: () => Promise<CardsDataFile>
  createLocalDeck?: (payload: SharedDeckPayloadV1) => Deck
  /** Null stands for a build with no Supabase configured. */
  shareSource?: DeckShareSource | null
}

/**
 * Keyed by the attempt as well as the id, so pressing retry makes the stored
 * result stale and the spinner comes back at once rather than after the next
 * response arrives.
 */
type LoadState =
  | { key: string; status: 'loaded'; payload: SharedDeckPayloadV1 }
  | { key: string; status: 'error'; reason: ShortShareLoadFailure }

/**
 * One message per outcome, none of them carrying anything the database said.
 * A missing link and an unreadable one are worded apart, because only the
 * second is worth retrying.
 */
function loadErrorMessage(reason: ShortShareLoadFailure): string {
  if (reason === 'unavailable') {
    return '短い共有リンクは、この環境では利用できません。'
  }
  if (reason === 'invalid-id' || reason === 'not-found') {
    return '共有デッキが見つかりません。リンクが正しいかご確認ください。'
  }
  return '共有デッキを読み込めませんでした。'
}

export function ShortSharePage({
  repository,
  loadCards,
  createLocalDeck,
  shareSource,
}: ShortSharePageProps) {
  const { shareId = '' } = useParams<{ shareId: string }>()
  // Resolved once so a test can pass a fake and a build with no keys gets null
  // without the page reaching for the SDK on every render.
  const source = useMemo(
    () =>
      shareSource === undefined ? createSupabaseDeckShareSource() : shareSource,
    [shareSource],
  )
  const [state, setState] = useState<LoadState>()
  const [attempt, setAttempt] = useState(0)
  const key = `${attempt}:${shareId}`

  // Derived rather than stored, so nothing has to be written during render or
  // synchronously in the effect below.
  const active: LoadState | { key: string; status: 'loading' } = !source
    ? { key, status: 'error', reason: 'unavailable' }
    : state?.key === key
      ? state
      : { key, status: 'loading' }

  useEffect(() => {
    if (!source) return
    let running = true
    void source.loadShare(shareId).then(
      (result) => {
        if (!running) return
        setState(
          result.ok
            ? { key, status: 'loaded', payload: result.payload }
            : { key, status: 'error', reason: result.reason },
        )
      },
      () => {
        if (running) setState({ key, status: 'error', reason: 'failed' })
      },
    )
    return () => {
      running = false
    }
  }, [key, shareId, source])

  useDocumentMetadata({
    title:
      active.status === 'loaded'
        ? `${active.payload.name} | HLSieve DB`
        : '共有デッキ | HLSieve DB',
    // No canonical: the content belongs to whoever made the link, and every
    // id is a separate page, so there is nothing to point at as the original.
    robots: 'noindex,follow',
  })

  return (
    <main id="main-content" className="deck-page shared-deck-page">
      <header className="deck-page__header">
        <AppNavigation />
        <Link className="back-link" to="/decks">
          保存デッキへ戻る
        </Link>
      </header>

      {active.status === 'loading' && (
        <p className="status-message" role="status">
          共有デッキを読み込んでいます…
        </p>
      )}

      {active.status === 'error' && (
        <section className="status-message status-message--error" role="alert">
          <h1>共有デッキ</h1>
          <p>{loadErrorMessage(active.reason)}</p>
          {/* Only a transport failure is worth another try. A missing or
              unreadable snapshot will not become readable by asking again. */}
          {active.reason === 'failed' && (
            <button
              type="button"
              className="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              再試行
            </button>
          )}
        </section>
      )}

      {active.status === 'loaded' && (
        <SharedDeckView
          payload={active.payload}
          source={`/s/${shareId}`}
          repository={repository}
          loadCards={loadCards}
          createLocalDeck={createLocalDeck}
        />
      )}
    </main>
  )
}
