import { Link } from 'react-router-dom'

import {
  CARD_DATA_UPDATE_HISTORY,
  formatUpdateDate,
  latestFirst,
} from '../domain/updates/history'
import type { CardDataUpdateEntry } from '../domain/updates/types'

type LatestUpdateNoticeProps = {
  entries?: readonly CardDataUpdateEntry[]
}

/** Whether this update changed the card data, as opposed to something else. */
function changesCardData(entry: CardDataUpdateEntry): boolean {
  return (
    entry.addedCards > 0 ||
    entry.changedCards > 0 ||
    entry.removedCards > 0 ||
    entry.addedPrintings > 0 ||
    entry.removedPrintings > 0
  )
}

export function LatestUpdateNotice({
  entries = CARD_DATA_UPDATE_HISTORY,
}: LatestUpdateNoticeProps) {
  // The newest card data update rather than the newest update of any kind:
  // this notice sits on the card search and calls itself a card data update,
  // so a change to something else would be announced under the wrong heading.
  const latest = latestFirst(entries).find(changesCardData)
  if (!latest) return null

  return (
    <aside className="latest-update-notice" aria-label="最新のカードデータ更新">
      <div>
        <p className="latest-update-notice__date">
          カードデータ更新 {formatUpdateDate(latest.publishedAt)}
        </p>
        <p>{latest.summary}</p>
      </div>
      <Link to="/updates">更新内容を見る</Link>
    </aside>
  )
}
