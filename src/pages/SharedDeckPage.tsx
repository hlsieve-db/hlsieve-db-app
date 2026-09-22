import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { AppNavigation } from '../components/AppNavigation'
import { SharedDeckView } from '../components/decks/SharedDeckView'
import type { CardsDataFile } from '../domain/cards/types'
import type { Deck } from '../domain/decks/types'
import { decodeDeckSharePayload } from '../domain/share/deckShareCodec'
import type {
  DeckShareDecodeErrorCode,
  SharedDeckPayloadV1,
} from '../domain/share/types'
import { type DeckRepository } from '../repositories/deckRepository'
import { useDocumentMetadata } from '../hooks/useDocumentMetadata'

/**
 * The long share link, which carries the whole deck in the URL. It needs no
 * server, so it keeps working in a build with no Supabase configured, and
 * every link ever issued stays readable.
 */

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

export function SharedDeckPage({
  repository,
  loadCards,
  createLocalDeck,
}: SharedDeckPageProps) {
  const [searchParams] = useSearchParams()
  const encoded = searchParams.get('d')
  const decoded = useMemo(
    () => (encoded === null ? undefined : decodeDeckSharePayload(encoded)),
    [encoded],
  )

  useDocumentMetadata({
    title:
      decoded?.ok === true
        ? `${decoded.value.name} | HLSieve DB`
        : '共有デッキ | HLSieve DB',
    canonicalPath: '/deck/share',
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
        <SharedDeckView
          payload={decoded.value}
          source={encoded ?? ''}
          repository={repository}
          loadCards={loadCards}
          createLocalDeck={createLocalDeck}
        />
      )}
    </main>
  )
}
