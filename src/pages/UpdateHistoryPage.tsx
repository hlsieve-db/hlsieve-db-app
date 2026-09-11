import { AppNavigation } from '../components/AppNavigation'
import {
  CARD_DATA_UPDATE_HISTORY,
  formatUpdateDate,
  latestFirst,
} from '../domain/updates/history'
import type { CardDataUpdateEntry } from '../domain/updates/types'
import { useDocumentMetadata } from '../hooks/useDocumentMetadata'
import { UPDATE_HISTORY_METADATA } from '../domain/site/metadata'

type UpdateHistoryPageProps = {
  entries?: readonly CardDataUpdateEntry[]
}

function Count({ children }: { children: string }) {
  return <li>{children}</li>
}

export function UpdateHistoryPage({
  entries = CARD_DATA_UPDATE_HISTORY,
}: UpdateHistoryPageProps) {
  useDocumentMetadata(UPDATE_HISTORY_METADATA)
  const ordered = latestFirst(entries)

  return (
    <main className="content-page update-history-page">
      <AppNavigation />
      <header className="content-page__header">
        <h1>更新履歴</h1>
        <p>カードデータの追加・修正内容をお知らせします。</p>
      </header>

      {ordered.length === 0 ? (
        <section className="content-surface update-history-empty">
          <h2>公開済みの更新履歴はありません</h2>
          <p>次回のカードデータ更新から、確認済みの内容を掲載します。</p>
        </section>
      ) : (
        <ol className="update-history-list">
          {ordered.map((entry) => (
            <li key={entry.id} className="content-surface update-history-entry">
              <time dateTime={entry.publishedAt}>
                {formatUpdateDate(entry.publishedAt)}
              </time>
              <h2>{entry.summary}</h2>
              <ul className="update-history-counts">
                {entry.addedCards > 0 && (
                  <Count>{`新規カード ${entry.addedCards}枚`}</Count>
                )}
                {entry.changedCards > 0 && (
                  <Count>{`修正カード ${entry.changedCards}枚`}</Count>
                )}
                {entry.removedCards > 0 && (
                  <Count>{`削除カード ${entry.removedCards}枚`}</Count>
                )}
                {entry.addedPrintings > 0 && (
                  <Count>{`新規版 ${entry.addedPrintings}種`}</Count>
                )}
                {entry.removedPrintings > 0 && (
                  <Count>{`削除版 ${entry.removedPrintings}種`}</Count>
                )}
              </ul>
              {entry.notes && entry.notes.length > 0 && (
                <ul className="update-history-notes">
                  {entry.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </main>
  )
}
